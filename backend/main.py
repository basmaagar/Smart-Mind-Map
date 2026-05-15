import json
import httpx
import uvicorn
import uuid
import os
import asyncio
import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from Bio import Entrez
from neo4j import GraphDatabase
from dotenv import load_dotenv
import re


load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi")
CACHE_FILE = "suggestion_cache.json"
Entrez.email = os.getenv("ENTREZ_EMAIL", "your_email@example.com")

# --- CACHE ---
def load_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache: dict):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception as e:
        logger.warning(f"Cache save failed: {e}")

_suggestion_cache: dict = load_cache()
logger.info(f"Loaded {len(_suggestion_cache)} cached concepts.")

# --- NEO4J ---
class Neo4jHandler:
    def __init__(self):
        try:
            auth = (NEO4J_USER, NEO4J_PASSWORD) if NEO4J_USER and NEO4J_PASSWORD else None
            self.driver = GraphDatabase.driver(NEO4J_URI, auth=auth)
            self.driver.verify_connectivity()
            logger.info("Connected to Neo4j.")
        except Exception as e:
            logger.error(f"Neo4j connection error: {e}")
            self.driver = None

    def query(self, query, parameters=None):
        if not self.driver:
            return []
        with self.driver.session() as session:
            return list(session.run(query, parameters))

db = Neo4jHandler()
app = FastAPI(title="MedMind OS - Kernel")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class SuggestRequest(BaseModel):
    concept: str
    project_id: Optional[str] = None
    ancestors: Optional[List[str]] = []

class StagedSuggestRequest(BaseModel):
    symptom: str
    concept: str
    stage: str
    accepted_nodes: Optional[List[str]] = []
    project_id: Optional[str] = None

class AcceptSuggestionRequest(BaseModel):
    project_id: str
    parent_concept: str
    child_concept: str
    evidence: str

# Placeholder terms that LLMs echo from prompt templates
PLACEHOLDER_TERMS = {
    "specific_medical_term", "real_medical_term_here",
    "specific_mechanism", "specific_test", "specific_treatment",
    "monitoring_parameter", "diagnosis_name", "most_likely_diagnosis",
    "second_diagnosis", "third_diagnosis", "fourth_diagnosis",
    "must_not_miss", "must_not_miss_diagnosis", "write_actual_medical_term",
    "specific_medical_subtopic", "write_actual_pmid", "pmid_from_above",
    "pmid", "term", "none", "actual_medical_term", "actual_mechanism_name",
    "actual_test_name", "actual_treatment_name", "actual_parameter_name",
    "actual_disease_name", "write_real_medical_term_here"
}

# --- SUGGESTION BUILDER WITH GUARANTEED EVIDENCE ---
def build_suggestions(
    items: list,
    docs: list,
    stage: str = None,
    existing: list = None
) -> list:
    existing = existing or []
    suggestions = []

    for item in items:
        if not isinstance(item, dict) or "term" not in item:
            continue

        term = str(item["term"]).strip()
        if not term:
            continue

        # Reject placeholder values echoed from prompt
        normalized = term.lower().replace(" ", "_").strip("⚠ ")
        # Exact match against known placeholders
        if normalized in PLACEHOLDER_TERMS:
            logger.warning(f"Rejected placeholder term: {term}")
            continue
        # Catch numbered variants: "Actual Medical Term 1", "Actual Medical Term 2" etc.
        if re.match(r'^actual[_ ]medical[_ ]term[_ ]*\d*$', normalized):
            logger.warning(f"Rejected numbered placeholder: {term}")
            continue
        # Catch any term that is just generic words + a number
        if re.match(r'^(actual|specific|real|sample|example|placeholder)[_ ].+[_ ]*\d+$', normalized):
            logger.warning(f"Rejected generic placeholder: {term}")
            continue

        # Reject if too short or looks like a template artifact
        if len(term) < 3 or term.startswith("{") or term.startswith("["):
            continue

        # Filter duplicates using graph context
        if any(term.lower() == ex.lower() for ex in existing):
            logger.info(f"Graph RAG filtered duplicate: {term}")
            continue

        # Handle rare_but_critical flag for differential stage
        if stage == "differential" and item.get("likelihood") == "rare_but_critical":
            term = f"⚠ {term}"

        # Try exact PMID match
        evidence_pubid = str(item.get("evidence_pubid", "")).strip()
        matching = None

        if evidence_pubid and evidence_pubid.lower() not in {"pmid", "pmid_from_above", "none", ""}:
            matching = next(
                (d for d in docs if str(d["pubid"]).strip() == evidence_pubid),
                None
            )
            # Partial match fallback
            if not matching:
                matching = next(
                    (d for d in docs if
                     evidence_pubid in str(d["pubid"]) or
                     str(d["pubid"]) in evidence_pubid),
                    None
                )

        # Final fallback — assign first doc so every suggestion has PubMed evidence
        if not matching and docs:
            matching = docs[0]

        ev = []
        if matching:
            ev.append({"title": matching["title"], "pubid": matching["pubid"]})

        result = {"name": term, "evidence": json.dumps(ev)}
        if stage:
            result["stage"] = stage

        suggestions.append(result)

    return suggestions


# --- GRAPH RAG: Neo4j traversal ---
def get_graph_context(concept: str, project_id: Optional[str] = None) -> dict:
    context = {
        "existing_nodes": [],
        "siblings": [],
        "depth": 0,
        "related_explored": [],
        "graph_summary": ""
    }

    try:
        if project_id:
            all_nodes_result = db.query("""
                MATCH (p:Project {id: $pid})-[:HAS_ROOT]->(root:Concept)
                OPTIONAL MATCH (root)-[:RELATED_TO*0..]->(n:Concept)
                RETURN DISTINCT n.name as name
            """, {"pid": project_id})
            context["existing_nodes"] = [
                r["name"] for r in all_nodes_result
                if r["name"] and r["name"] != concept
            ]

        siblings_result = db.query("""
            MATCH (parent:Concept)-[:RELATED_TO]->(current:Concept {name: $cname})
            MATCH (parent)-[:RELATED_TO]->(sibling:Concept)
            WHERE sibling.name <> $cname
            RETURN DISTINCT sibling.name as name
        """, {"cname": concept})
        context["siblings"] = [r["name"] for r in siblings_result if r["name"]]

        depth_result = db.query("""
            MATCH path = (root:Concept)-[:RELATED_TO*0..]->(current:Concept {name: $cname})
            WHERE NOT ()-[:RELATED_TO]->(root)
            RETURN length(path) as depth
            ORDER BY depth DESC LIMIT 1
        """, {"cname": concept})
        if depth_result:
            context["depth"] = depth_result[0]["depth"]

        explored_result = db.query("""
            MATCH (current:Concept {name: $cname})-[:RELATED_TO]->(child:Concept)
            RETURN DISTINCT child.name as name
        """, {"cname": concept})
        context["related_explored"] = [r["name"] for r in explored_result if r["name"]]

        summary_parts = []
        if context["existing_nodes"]:
            summary_parts.append(f"Already mapped: {', '.join(context['existing_nodes'][:10])}")
        if context["siblings"]:
            summary_parts.append(f"Siblings: {', '.join(context['siblings'][:5])}")
        if context["related_explored"]:
            summary_parts.append(f"Already explored: {', '.join(context['related_explored'])}")
        if context["depth"] > 0:
            summary_parts.append(f"Depth: {context['depth']}")

        context["graph_summary"] = " | ".join(summary_parts) if summary_parts else "No prior graph context"

        logger.info(
            f"Graph RAG for '{concept}': depth={context['depth']}, "
            f"existing={len(context['existing_nodes'])}, siblings={len(context['siblings'])}"
        )

    except Exception as e:
        logger.error(f"Graph RAG traversal failed: {e}")

    return context


def enrich_pubmed_query(concept: str, graph_context: dict, ancestors: list) -> str:
    base_query = concept
    if ancestors:
        base_query = f"{concept} {ancestors[-1]}"
    depth = graph_context.get("depth", 0)
    if depth == 0:
        base_query += " overview pathophysiology"
    elif depth == 1:
        base_query += " mechanism clinical"
    else:
        base_query += " specific treatment outcome"
    return base_query


# --- LIVE PUBMED RAG ---
def fetch_pubmed_abstracts(query: str, max_results: int = 3) -> list:
    try:
        search_handle = Entrez.esearch(
            db="pubmed",
            term=f"{query}[Title/Abstract]",
            retmax=max_results,
            sort="relevance"
        )
        search_results = Entrez.read(search_handle)
        search_handle.close()
        pmids = search_results.get("IdList", [])

        if not pmids:
            logger.warning(f"No PubMed results for: {query}")
            return []

        fetch_handle = Entrez.efetch(
            db="pubmed",
            id=",".join(pmids),
            rettype="xml",
            retmode="xml"
        )
        raw_xml = fetch_handle.read()
        fetch_handle.close()

        root = ET.fromstring(raw_xml)
        docs = []
        for article in root.findall(".//PubmedArticle"):
            try:
                pubid_el = article.find(".//PMID")
                pubid = pubid_el.text if pubid_el is not None else "unknown"
                title_el = article.find(".//ArticleTitle")
                title = title_el.text if title_el is not None else "No title"
                abstract_texts = article.findall(".//AbstractText")
                abstract = " ".join((el.text or "") for el in abstract_texts).strip()
                if abstract:
                    docs.append({
                        "pubid": pubid,
                        "title": title,
                        "abstract": abstract[:150]
                    })
            except Exception as e:
                logger.warning(f"Failed to parse article: {e}")
                continue

        logger.info(f"PubMed fetched {len(docs)} abstracts for: {query}")
        return docs

    except Exception as e:
        logger.error(f"PubMed API error for '{query}': {type(e).__name__}: {e}")
        return []


def build_context_str(docs: list) -> str:
    if not docs:
        return "No PubMed sources available."
    return "\n\n".join(
        f"[PMID:{d['pubid']}] {d['title']}\n{d['abstract']}"
        for d in docs
    )

def build_evidences(docs: list) -> list:
    return [{"title": d["title"], "pubid": d["pubid"]} for d in docs]


# --- LLM FALLBACK ---
async def generate_llm_fallback(
    concept: str,
    ancestors: list,
    docs: list = None
) -> list:
    ancestor_str = " → ".join(ancestors + [concept]) if ancestors else concept
    prompt = f"""You are a medical expert. List 5 real, specific clinical subtopics for: {concept}
Context: {ancestor_str}
Do NOT use placeholder text. Write actual medical terms only.
Return ONLY valid JSON: {{"subtopics":[{{"term":"write_real_medical_term_here"}}]}}"""

    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"num_predict": 200, "temperature": 0.4}
                }
            )
            parsed = json.loads(res.json().get("response", "{}"))
            items = parsed.get("subtopics", [])
            if docs:
                return build_suggestions(items, docs)
            return [
                {"name": item["term"], "evidence": "[]"}
                for item in items
                if isinstance(item, dict) and "term" in item
                and item["term"].lower().replace(" ", "_") not in PLACEHOLDER_TERMS
            ]
        except Exception as e:
            logger.error(f"Fallback LLM failed: {e}")
            return []


# --- STAGE PROMPTS ---
STAGE_PROMPTS = {
    "differential": """You are an experienced clinician. Patient presents with: '{symptom}'.

PubMed evidence (use ONLY these PMIDs):
{context}

Graph context — DO NOT suggest these already-mapped concepts:
{graph_summary}

Generate exactly 5 real differential diagnoses ranked most to least likely.
Write actual disease names — NOT placeholder text like "Diagnosis_Name".

Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"Actual_Disease_Name","likelihood":"common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Actual_Disease_Name","likelihood":"common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Actual_Disease_Name","likelihood":"less_common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Actual_Disease_Name","likelihood":"less_common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Actual_Disease_Name","likelihood":"rare_but_critical","evidence_pubid":"ACTUAL_PMID"}}
]}}""",

    "mechanism": """You are a medical pathophysiologist.
Symptom: '{symptom}' | Diagnosis: '{concept}'

PubMed evidence (use ONLY these PMIDs):
{context}

Graph context — DO NOT repeat these:
{graph_summary}

List 5 real pathophysiological mechanisms for '{concept}'.
Write actual mechanism names — NOT placeholder text like "Specific_Mechanism".

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Actual_Mechanism_Name","evidence_pubid":"ACTUAL_PMID"}}]}}""",

    "workup": """You are a clinical diagnostician.
Symptom: '{symptom}' | Diagnosis: '{concept}'

PubMed evidence (use ONLY these PMIDs):
{context}

Graph context — DO NOT repeat these:
{graph_summary}

List 5 real diagnostic tests to confirm '{concept}', ordered by priority.
Write actual test names — NOT placeholder text like "Specific_Test".

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Actual_Test_Name","evidence_pubid":"ACTUAL_PMID"}}]}}""",

    "treatment": """You are a clinical pharmacologist.
Symptom: '{symptom}' | Diagnosis: '{concept}'

PubMed evidence (use ONLY these PMIDs):
{context}

Graph context — DO NOT repeat these:
{graph_summary}

List 5 real evidence-based treatments for '{concept}'.
Write actual treatment names — NOT placeholder text like "Specific_Treatment".

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Actual_Treatment_Name","evidence_pubid":"ACTUAL_PMID"}}]}}""",

    "monitoring": """You are a clinical specialist.
Symptom: '{symptom}' | Condition: '{concept}'

PubMed evidence (use ONLY these PMIDs):
{context}

Graph context — DO NOT repeat these:
{graph_summary}

List 5 real monitoring parameters for '{concept}'.
Write actual parameter names — NOT placeholder text like "Monitoring_Parameter".

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Actual_Parameter_Name","evidence_pubid":"ACTUAL_PMID"}}]}}"""
}


# --- API ROUTES ---

@app.get("/projects/{project_id}")
async def get_project_graph(project_id: str):
    query = """
    MATCH (p:Project {id: $pid})-[:HAS_ROOT]->(root:Concept)
    OPTIONAL MATCH (n:Concept)-[r:RELATED_TO]->(m:Concept)
    WHERE (root)-[:RELATED_TO*0..]->(n)
    RETURN root, n, r, m
    """
    results = db.query(query, {"pid": project_id})
    elements = []
    added_ids = set()

    for record in results:
        for key in ["root", "n", "m"]:
            node = record.get(key)
            if node:
                u_id = str(node["name"]).lower().strip()
                if u_id not in added_ids:
                    try:
                        ev = json.loads(node["evidence"]) if "evidence" in node else []
                    except Exception:
                        ev = []
                    elements.append({
                        "group": "nodes",
                        "data": {"id": u_id, "label": node["name"], "evidence": ev}
                    })
                    added_ids.add(u_id)

        if (record.get("r") is not None and
                record.get("n") is not None and
                record.get("m") is not None):
            source_id = str(record["n"]["name"]).lower().strip()
            target_id = str(record["m"]["name"]).lower().strip()
            elements.append({
                "group": "edges",
                "data": {
                    "id": f"edge-{source_id}-{target_id}",
                    "source": source_id,
                    "target": target_id
                }
            })

    logger.info(f"Returning {len(elements)} elements for project {project_id}")
    return elements


@app.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    try:
        # Single query — detach delete removes all relationships then nodes
        # DETACH DELETE is the correct Neo4j pattern for this
        db.query("""
            MATCH (p:Project {id: $pid})-[:HAS_ROOT]->(root:Concept)
            OPTIONAL MATCH (root)-[:RELATED_TO*0..]->(n:Concept)
            DETACH DELETE n, root, p
        """, {"pid": project_id})

        # Fallback — if project has no root yet, delete the project node alone
        db.query("""
            MATCH (p:Project {id: $pid})
            DETACH DELETE p
        """, {"pid": project_id})

        logger.info(f"Deleted project: {project_id}")
        return {"status": "success", "deleted": project_id}

    except Exception as e:
        logger.error(f"Failed to delete project {project_id}: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/suggest")
async def suggest_and_save(request: SuggestRequest):
    p_id = request.project_id or str(uuid.uuid4())
    ck = request.concept.lower().strip()
    ancestors = request.ancestors or []

    # Cache hit
    if ck in _suggestion_cache:
        logger.info(f"Cache hit: '{ck}'")
        cached = _suggestion_cache[ck]
        db.query(
            "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
            {"pid": p_id, "title": f"Exploration: {request.concept}",
             "date": datetime.now().isoformat()}
        )
        db.query(
            "MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev",
            {"pname": request.concept, "ev": json.dumps(cached["evidences"])}
        )
        if not request.project_id:
            db.query(
                "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) "
                "MERGE (p)-[:HAS_ROOT]->(c)",
                {"pid": p_id, "cname": request.concept}
            )
        return {
            "project_id": p_id, "parent": request.concept,
            "suggestions": cached["suggestions"],
            "evidence_pointers": cached["evidences"], "cached": True
        }

    # GRAPH RAG — traverse Neo4j for context
    graph_context = get_graph_context(
        request.concept,
        p_id if request.project_id else None
    )

    enriched_query = enrich_pubmed_query(request.concept, graph_context, ancestors)
    docs = await asyncio.to_thread(fetch_pubmed_abstracts, enriched_query, 3)
    if not docs:
        docs = await asyncio.to_thread(fetch_pubmed_abstracts, request.concept, 3)

    evidences = build_evidences(docs)
    context_str = build_context_str(docs)
    ancestor_chain = " → ".join(ancestors + [request.concept]) if ancestors else request.concept

    all_existing = list(set(
        graph_context["existing_nodes"] +
        graph_context["siblings"] +
        graph_context["related_explored"] +
        ancestors
    ))

    available_pmids = ", ".join(str(d["pubid"]) for d in docs) if docs else "none"
    first_pmid = docs[0]["pubid"] if docs else "none"

    prompt = f"""You are a medical expert expanding a clinical knowledge map.

Concept: '{request.concept}'
Clinical hierarchy: {ancestor_chain}
Map depth: {graph_context['depth']}

PubMed evidence (ONLY use these PMIDs: {available_pmids}):
{context_str}

Already mapped — DO NOT suggest these concepts:
{', '.join(all_existing[:15]) if all_existing else 'None yet'}

Task: suggest 5 NEW, SPECIFIC, REAL medical subtopics for '{request.concept}'.
- Write actual medical terms, NOT placeholders
- Go deeper given map depth {graph_context['depth']}
- Every term must have evidence_pubid set to one of: {available_pmids}

Return ONLY valid JSON with 5 real medical terms (no placeholder text):
{{"subtopics":[{{"term":"FILL_WITH_REAL_TERM","evidence_pubid":"{first_pmid}"}}]}}"""

    suggestions_data = []
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"num_predict": 300, "temperature": 0.2}
                }
            )
            parsed = json.loads(res.json().get("response", "{}"))
            suggestions_data = build_suggestions(
                parsed.get("subtopics", []),
                docs,
                existing=all_existing
            )
        except Exception as e:
            logger.error(f"LLM failed: {type(e).__name__}: {e}")

    if not suggestions_data:
        suggestions_data = await generate_llm_fallback(request.concept, ancestors, docs)

    if suggestions_data:
        _suggestion_cache[ck] = {"suggestions": suggestions_data, "evidences": evidences}
        save_cache(_suggestion_cache)

    db.query(
        "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
        {"pid": p_id, "title": f"Exploration: {request.concept}",
         "date": datetime.now().isoformat()}
    )
    db.query(
        "MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev",
        {"pname": request.concept, "ev": json.dumps(evidences)}
    )
    if not request.project_id:
        db.query(
            "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) "
            "MERGE (p)-[:HAS_ROOT]->(c)",
            {"pid": p_id, "cname": request.concept}
        )

    return {
        "project_id": p_id, "parent": request.concept,
        "suggestions": suggestions_data, "evidence_pointers": evidences
    }


@app.post("/suggest-staged")
async def suggest_staged(request: StagedSuggestRequest):
    p_id = request.project_id or str(uuid.uuid4())
    ck = f"staged_{request.stage}_{request.concept.lower().strip()}"

    if ck in _suggestion_cache:
        logger.info(f"Cache hit (staged): '{ck}'")
        cached = _suggestion_cache[ck]
        db.query(
            "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
            {"pid": p_id, "title": f"Clinical: {request.symptom}",
             "date": datetime.now().isoformat()}
        )
        db.query(
            "MERGE (parent:Concept {name: $pname}) "
            "SET parent.evidence = $ev, parent.stage = $stage",
            {"pname": request.concept,
             "ev": json.dumps(cached["evidences"]),
             "stage": request.stage}
        )
        if not request.project_id:
            db.query(
                "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) "
                "MERGE (p)-[:HAS_ROOT]->(c)",
                {"pid": p_id, "cname": request.concept}
            )
        return {
            "project_id": p_id, "parent": request.concept,
            "stage": request.stage,
            "suggestions": cached["suggestions"],
            "evidence_pointers": cached["evidences"], "cached": True
        }

    # GRAPH RAG for staged suggestions
    graph_context = get_graph_context(
        request.concept,
        p_id if request.project_id else None
    )

    stage_query_map = {
        "differential": f"{request.symptom} differential diagnosis etiology",
        "mechanism":    f"{request.concept} pathophysiology mechanism",
        "workup":       f"{request.concept} diagnostic workup laboratory imaging",
        "treatment":    f"{request.concept} treatment management therapy",
        "monitoring":   f"{request.concept} monitoring prognosis complications"
    }
    search_query = stage_query_map.get(
        request.stage,
        f"{request.symptom} {request.concept}"
    )
    docs = await asyncio.to_thread(fetch_pubmed_abstracts, search_query, 3)
    if not docs:
        docs = await asyncio.to_thread(
            fetch_pubmed_abstracts,
            f"{request.symptom} {request.concept}", 3
        )

    evidences = build_evidences(docs)
    context_str = build_context_str(docs)
    available_pmids = ", ".join(str(d["pubid"]) for d in docs) if docs else "none"

    prompt_template = STAGE_PROMPTS.get(request.stage, STAGE_PROMPTS["differential"])
    prompt = prompt_template.format(
        symptom=request.symptom,
        concept=request.concept,
        context=context_str,
        graph_summary=graph_context["graph_summary"] or "No prior context"
    )
    prompt += f"\n\nAvailable PMIDs to use: {available_pmids}"

    all_existing = list(set(
        graph_context["existing_nodes"] +
        graph_context["siblings"] +
        graph_context["related_explored"]
    ))

    suggestions_data = []
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"num_predict": 300, "temperature": 0.2}
                }
            )
            raw = res.json().get("response", "{}")
            logger.info(f"Staged LLM raw: {raw[:200]}")
            parsed = json.loads(raw)
            suggestions_data = build_suggestions(
                parsed.get("subtopics", []),
                docs,
                stage=request.stage,
                existing=all_existing
            )
        except Exception as e:
            logger.error(f"Staged LLM failed: {type(e).__name__}: {e}")

    if not suggestions_data:
        suggestions_data = await generate_llm_fallback(
            request.concept, [request.symptom], docs
        )

    if suggestions_data:
        _suggestion_cache[ck] = {"suggestions": suggestions_data, "evidences": evidences}
        save_cache(_suggestion_cache)

    db.query(
        "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
        {"pid": p_id, "title": f"Clinical: {request.symptom}",
         "date": datetime.now().isoformat()}
    )
    db.query(
        "MERGE (parent:Concept {name: $pname}) "
        "SET parent.evidence = $ev, parent.stage = $stage",
        {"pname": request.concept,
         "ev": json.dumps(evidences),
         "stage": request.stage}
    )
    if not request.project_id:
        db.query(
            "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) "
            "MERGE (p)-[:HAS_ROOT]->(c)",
            {"pid": p_id, "cname": request.concept}
        )

    return {
        "project_id": p_id, "parent": request.concept,
        "stage": request.stage,
        "suggestions": suggestions_data,
        "evidence_pointers": evidences
    }


@app.post("/accept-suggestion")
async def accept_suggestion(request: AcceptSuggestionRequest):
    db.query("""
        MATCH (parent:Concept {name: $pname})
        MERGE (child:Concept {name: $cname})
        SET child.evidence = $ev
        MERGE (parent)-[:RELATED_TO]->(child)
    """, {
        "pname": request.parent_concept,
        "cname": request.child_concept,
        "ev": request.evidence
    })
    return {"status": "success"}


@app.get("/projects")
async def list_projects():
    results = db.query(
        "MATCH (p:Project) RETURN p.id as id, p.title as title "
        "ORDER BY p.created_at DESC"
    )
    return [dict(r) for r in results]


@app.post("/fetch-full-evidence")
async def fetch_full_evidence(request: dict):
    pubid = request.get("pubid")
    if not pubid:
        return {"error": "pubid required"}
    try:
        handle = Entrez.efetch(
            db="pubmed", id=pubid,
            rettype="abstract", retmode="text"
        )
        return {"full_content": handle.read()}
    except Exception as e:
        return {"error": str(e)}
class SaveArticleRequest(BaseModel):
    pubid: str
    title: str

@app.post("/saved-articles")
async def save_article(request: SaveArticleRequest):
    """Save a PubMed article to the global library."""
    try:
        db.query("""
            MERGE (a:SavedArticle {pubid: $pubid})
            SET a.title = $title, a.saved_at = $date
        """, {
            "pubid": request.pubid,
            "title": request.title,
            "date": datetime.now().isoformat()
        })
        logger.info(f"Saved article: {request.pubid}")
        return {"status": "success", "pubid": request.pubid}
    except Exception as e:
        logger.error(f"Failed to save article: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/saved-articles")
async def get_saved_articles():
    """Get all saved PubMed articles."""
    results = db.query(
        "MATCH (a:SavedArticle) RETURN a.pubid as pubid, a.title as title, "
        "a.saved_at as saved_at ORDER BY a.saved_at DESC"
    )
    return [dict(r) for r in results]

@app.delete("/saved-articles/{pubid}")
async def delete_saved_article(pubid: str):
    """Remove an article from the saved library."""
    try:
        db.query(
            "MATCH (a:SavedArticle {pubid: $pubid}) DETACH DELETE a",
            {"pubid": pubid}
        )
        return {"status": "success", "deleted": pubid}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)