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

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
CACHE_FILE = "suggestion_cache.json"
Entrez.email = os.getenv("ENTREZ_EMAIL", "your_email@example.com")

# --- PERSISTENT CACHE ---
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

# --- LIVE PUBMED RAG ---
def fetch_pubmed_abstracts(query: str, max_results: int = 5) -> list:
    """
    Fetch real PubMed abstracts for a query via Entrez API.
    Returns list of {title, abstract, pubid} dicts.
    Falls back to empty list on any failure.
    """
    try:
        # Step 1: Search for PMIDs
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

        # Step 2: Fetch abstracts for found PMIDs
        fetch_handle = Entrez.efetch(
            db="pubmed",
            id=",".join(pmids),
            rettype="xml",
            retmode="xml"
        )
        raw_xml = fetch_handle.read()
        fetch_handle.close()

        # Step 3: Parse XML to extract title + abstract
        root = ET.fromstring(raw_xml)
        docs = []
        for article in root.findall(".//PubmedArticle"):
            try:
                pubid_el = article.find(".//PMID")
                pubid = pubid_el.text if pubid_el is not None else "unknown"

                title_el = article.find(".//ArticleTitle")
                title = title_el.text if title_el is not None else "No title"

                # Abstract can have multiple sections
                abstract_texts = article.findall(".//AbstractText")
                abstract = " ".join(
                    (el.text or "") for el in abstract_texts
                ).strip()

                if abstract:
                    docs.append({
                        "pubid": pubid,
                        "title": title,
                        "abstract": abstract[:500]  # cap at 500 chars for prompt
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
    """Format PubMed docs into a clean LLM context string."""
    if not docs:
        return "No PubMed sources available."
    lines = []
    for doc in docs:
        lines.append(
            f"[PMID:{doc['pubid']}] {doc['title']}\n"
            f"Abstract: {doc['abstract']}"
        )
    return "\n\n".join(lines)


def build_evidences(docs: list) -> list:
    """Build evidence pointer list from PubMed docs."""
    return [{"title": d["title"], "pubid": d["pubid"]} for d in docs]


# --- LLM FALLBACK ---
async def generate_llm_fallback(concept: str, ancestors: list) -> list:
    ancestor_str = " → ".join(ancestors + [concept]) if ancestors else concept
    prompt = f"""You are a medical expert. Using your medical knowledge, suggest 5 specific clinical subtopics for:
Medical context: {ancestor_str}
Current concept: {concept}

Return ONLY valid JSON:
{{"subtopics":[{{"term":"specific_medical_subtopic"}}]}}"""

    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json",
                      "stream": False, "options": {"num_predict": 200, "temperature": 0.4}}
            )
            parsed = json.loads(res.json().get("response", "{}"))
            return [
                {"name": item["term"], "evidence": "[]"}
                for item in parsed.get("subtopics", [])
                if isinstance(item, dict) and "term" in item
            ]
        except Exception as e:
            logger.error(f"Fallback LLM failed: {e}")
            return []


# --- STAGE PROMPTS ---
STAGE_PROMPTS = {
    "differential": """You are an experienced clinician. A patient presents with: '{symptom}'.

PubMed evidence:
{context}

Generate exactly 5 differential diagnoses ranked from most to least likely.
Each must be a specific named medical condition grounded in the evidence above.
Consider common causes first, then serious conditions that must not be missed.

Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"Most_Likely_Diagnosis","likelihood":"common","evidence_pubid":"PMID"}},
  {{"term":"Second_Diagnosis","likelihood":"common","evidence_pubid":"PMID"}},
  {{"term":"Third_Diagnosis","likelihood":"less_common","evidence_pubid":"PMID"}},
  {{"term":"Fourth_Diagnosis","likelihood":"less_common","evidence_pubid":"PMID"}},
  {{"term":"Must_Not_Miss","likelihood":"rare_but_critical","evidence_pubid":"PMID"}}
]}}""",

    "mechanism": """You are a medical pathophysiologist.
Symptom: '{symptom}' — Working diagnosis: '{concept}'

PubMed evidence:
{context}

List 5 specific pathophysiological mechanisms underlying '{concept}'.
Each must be a concrete biological process, not a vague category.

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Specific_Mechanism","evidence_pubid":"PMID"}}]}}""",

    "workup": """You are a clinical diagnostician.
Symptom: '{symptom}' — Working diagnosis: '{concept}'

PubMed evidence:
{context}

List exactly 5 specific diagnostic tests to confirm '{concept}', ordered by clinical priority.
Each must be a specific named test.

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Specific_Test","evidence_pubid":"PMID"}}]}}""",

    "treatment": """You are a clinical pharmacologist.
Symptom: '{symptom}' — Confirmed diagnosis: '{concept}'

PubMed evidence:
{context}

List exactly 5 specific evidence-based treatments for '{concept}'.
Include first-line and second-line options.

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Specific_Treatment","evidence_pubid":"PMID"}}]}}""",

    "monitoring": """You are a clinical specialist.
Symptom: '{symptom}' — Treated condition: '{concept}'

PubMed evidence:
{context}

List exactly 5 specific monitoring parameters or complications to watch for '{concept}'.

Return ONLY valid JSON:
{{"subtopics":[{{"term":"Monitoring_Parameter","evidence_pubid":"PMID"}}]}}"""
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

        if record.get("r") is not None and record.get("n") is not None and record.get("m") is not None:
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
            {"pid": p_id, "title": f"Exploration: {request.concept}", "date": datetime.now().isoformat()}
        )
        db.query("MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev",
                 {"pname": request.concept, "ev": json.dumps(cached["evidences"])})
        if not request.project_id:
            db.query(
                "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
                {"pid": p_id, "cname": request.concept}
            )
        return {"project_id": p_id, "parent": request.concept,
                "suggestions": cached["suggestions"],
                "evidence_pointers": cached["evidences"], "cached": True}

    # LIVE PUBMED RAG — fetch real abstracts for this concept
    search_query = f"{request.concept} {' '.join(ancestors[-2:])}" if ancestors else request.concept
    docs = await asyncio.to_thread(fetch_pubmed_abstracts, search_query, 3)
    # Run in thread since Entrez is synchronous
    # If no results, try concept alone
    if not docs and ancestors:
        docs = await asyncio.to_thread(fetch_pubmed_abstracts, request.concept, 5)

    evidences = build_evidences(docs)
    context_str = build_context_str(docs)

    ancestor_chain = " → ".join(ancestors + [request.concept]) if ancestors else request.concept

    prompt = f"""You are a medical expert. Based on the following PubMed abstracts about '{request.concept}', extract 5 highly specific medical subtopics.

Clinical context: {ancestor_chain}
Current concept: {request.concept}

PubMed abstracts:
{context_str}

Rules:
- Each subtopic must be specific to '{request.concept}'
- Do NOT repeat concepts already in the hierarchy: {', '.join(ancestors) if ancestors else 'none'}
- Ground each suggestion in the PubMed evidence above

Return ONLY valid JSON:
{{"subtopics":[{{"term":"specific_medical_term","evidence_pubid":"PMID_from_above"}}]}}"""

    suggestions_data = []
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json",
                      "stream": False, "options": {"num_predict": 300, "temperature": 0.2}}
            )
            parsed = json.loads(res.json().get("response", "{}"))
            for item in parsed.get("subtopics", []):
                if isinstance(item, dict) and "term" in item:
                    ev = []
                    if item.get("evidence_pubid"):
                        matching_doc = next(
                            (d for d in docs if str(d["pubid"]) == str(item["evidence_pubid"])),
                            None
                        )
                        if matching_doc:
                            ev.append({"title": matching_doc["title"], "pubid": matching_doc["pubid"]})
                    suggestions_data.append({"name": item["term"], "evidence": json.dumps(ev)})
        except Exception as e:
            logger.error(f"LLM failed: {type(e).__name__}: {e}")

    if not suggestions_data:
        suggestions_data = await generate_llm_fallback(request.concept, ancestors)

    if suggestions_data:
        _suggestion_cache[ck] = {"suggestions": suggestions_data, "evidences": evidences}
        save_cache(_suggestion_cache)

    db.query(
        "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
        {"pid": p_id, "title": f"Exploration: {request.concept}", "date": datetime.now().isoformat()}
    )
    db.query("MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev",
             {"pname": request.concept, "ev": json.dumps(evidences)})

    if not request.project_id:
        db.query(
            "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
            {"pid": p_id, "cname": request.concept}
        )

    return {"project_id": p_id, "parent": request.concept,
            "suggestions": suggestions_data, "evidence_pointers": evidences}


@app.post("/suggest-staged")
async def suggest_staged(request: StagedSuggestRequest):
    p_id = request.project_id or str(uuid.uuid4())
    ck = f"staged_{request.stage}_{request.concept.lower().strip()}"

    if ck in _suggestion_cache:
        logger.info(f"Cache hit (staged): '{ck}'")
        cached = _suggestion_cache[ck]
        db.query(
            "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
            {"pid": p_id, "title": f"Clinical: {request.symptom}", "date": datetime.now().isoformat()}
        )
        db.query("MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev, parent.stage = $stage",
                 {"pname": request.concept, "ev": json.dumps(cached["evidences"]), "stage": request.stage})
        if not request.project_id:
            db.query(
                "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
                {"pid": p_id, "cname": request.concept}
            )
        return {"project_id": p_id, "parent": request.concept, "stage": request.stage,
                "suggestions": cached["suggestions"], "evidence_pointers": cached["evidences"], "cached": True}

    # LIVE PUBMED RAG for staged suggestions
    search_query = f"{request.symptom} {request.concept} {request.stage}"
    docs = await asyncio.to_thread(fetch_pubmed_abstracts, search_query, 5)
    if not docs:
        docs = await asyncio.to_thread(fetch_pubmed_abstracts, f"{request.symptom} {request.concept}", 5)

    evidences = build_evidences(docs)
    context_str = build_context_str(docs)

    prompt_template = STAGE_PROMPTS.get(request.stage, STAGE_PROMPTS["differential"])
    prompt = prompt_template.format(
        symptom=request.symptom,
        concept=request.concept,
        context=context_str
    )

    suggestions_data = []
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json",
                      "stream": False, "options": {"num_predict": 300, "temperature": 0.2}}
            )
            raw = res.json().get("response", "{}")
            logger.info(f"Staged LLM raw: {raw[:200]}")
            parsed = json.loads(raw)
            for item in parsed.get("subtopics", []):
                if isinstance(item, dict) and "term" in item:
                    term = item["term"]
                    if request.stage == "differential" and item.get("likelihood") == "rare_but_critical":
                        term = f"⚠ {term}"
                    ev = []
                    if item.get("evidence_pubid"):
                        matching_doc = next(
                            (d for d in docs if str(d["pubid"]) == str(item["evidence_pubid"])),
                            None
                        )
                        if matching_doc:
                            ev.append({"title": matching_doc["title"], "pubid": matching_doc["pubid"]})
                    suggestions_data.append({"name": term, "evidence": json.dumps(ev), "stage": request.stage})
        except Exception as e:
            logger.error(f"Staged LLM failed: {type(e).__name__}: {e}")

    if not suggestions_data:
        suggestions_data = await generate_llm_fallback(request.concept, [request.symptom])

    if suggestions_data:
        _suggestion_cache[ck] = {"suggestions": suggestions_data, "evidences": evidences}
        save_cache(_suggestion_cache)

    db.query(
        "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
        {"pid": p_id, "title": f"Clinical: {request.symptom}", "date": datetime.now().isoformat()}
    )
    db.query("MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev, parent.stage = $stage",
             {"pname": request.concept, "ev": json.dumps(evidences), "stage": request.stage})

    if not request.project_id:
        db.query(
            "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
            {"pid": p_id, "cname": request.concept}
        )

    return {"project_id": p_id, "parent": request.concept, "stage": request.stage,
            "suggestions": suggestions_data, "evidence_pointers": evidences}


@app.post("/accept-suggestion")
async def accept_suggestion(request: AcceptSuggestionRequest):
    db.query("""
        MATCH (parent:Concept {name: $pname})
        MERGE (child:Concept {name: $cname})
        SET child.evidence = $ev
        MERGE (parent)-[:RELATED_TO]->(child)
    """, {"pname": request.parent_concept, "cname": request.child_concept, "ev": request.evidence})
    return {"status": "success"}


@app.get("/projects")
async def list_projects():
    results = db.query("MATCH (p:Project) RETURN p.id as id, p.title as title ORDER BY p.created_at DESC")
    return [dict(r) for r in results]


@app.post("/fetch-full-evidence")
async def fetch_full_evidence(request: dict):
    pubid = request.get("pubid")
    if not pubid:
        return {"error": "pubid required"}
    try:
        handle = Entrez.efetch(db="pubmed", id=pubid, rettype="abstract", retmode="text")
        return {"full_content": handle.read()}
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)