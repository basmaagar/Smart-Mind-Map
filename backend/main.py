import json
import httpx
import faiss
import pickle
import uvicorn
import uuid
import os
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from Bio import Entrez
from neo4j import GraphDatabase
from dotenv import load_dotenv

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
CACHE_FILE = "suggestion_cache.json"
Entrez.email = "your_email@example.com"

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
logger.info(f"Loaded {len(_suggestion_cache)} cached concepts from disk.")

class Neo4jHandler:
    def __init__(self):
        try:
            auth = (NEO4J_USER, NEO4J_PASSWORD) if NEO4J_USER and NEO4J_PASSWORD else None
            self.driver = GraphDatabase.driver(NEO4J_URI, auth=auth)
            self.driver.verify_connectivity()
            logger.info("Connected to Neo4j database.")
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

class SuggestRequest(BaseModel):
    concept: str
    project_id: Optional[str] = None
    # ADDED: ancestor chain so the LLM knows the full context
    ancestors: Optional[List[str]] = []

class AcceptSuggestionRequest(BaseModel):
    project_id: str
    parent_concept: str
    child_concept: str
    evidence: str

logger.info("Loading RAG assets...")
embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
index = faiss.read_index("med_knowledge.index")
with open("med_texts.pkl", "rb") as f:
    docs = pickle.load(f)
docstore = InMemoryDocstore({str(i): d for i, d in enumerate(docs)})
vectorstore = FAISS(embeddings_model, index, docstore, {i: str(i) for i in range(len(docs))})
logger.info(f"RAG loaded: {len(docs)} documents indexed.")


async def generate_llm_fallback(concept: str, ancestors: list) -> list:
    """
    When RAG context is poor, ask the LLM to use its own medical knowledge.
    This produces real subtopics instead of hardcoded generic strings.
    """
    ancestor_str = " → ".join(ancestors + [concept]) if ancestors else concept
    prompt = f"""You are a medical expert. Using your medical knowledge only, suggest 5 specific clinical subtopics for:
Medical context: {ancestor_str}
Current concept: {concept}

Return ONLY valid JSON, no explanation:
{{"subtopics":[{{"term":"specific_medical_subtopic"}}]}}
Each term must be a real, specific medical concept related to {concept}."""

    async with httpx.AsyncClient(timeout=120.0) as client:
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
            subs = parsed.get("subtopics", [])
            return [
                {"name": item["term"], "evidence": "[]"}
                for item in subs
                if isinstance(item, dict) and "term" in item
            ]
        except Exception as e:
            logger.error(f"Fallback LLM also failed: {e}")
            return []


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

    print(f"Envoi de {len(elements)} éléments pour le projet {project_id}")
    return elements


@app.post("/suggest")
async def suggest_and_save(request: SuggestRequest):
    p_id = request.project_id or str(uuid.uuid4())
    ck = request.concept.lower().strip()
    ancestors = request.ancestors or []

    # Cache hit — return instantly
    if ck in _suggestion_cache:
        logger.info(f"Cache hit: '{ck}'")
        cached = _suggestion_cache[ck]
        db.query(
            "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
            {"pid": p_id, "title": f"Exploration: {request.concept}", "date": datetime.now().isoformat()}
        )
        db.query(
            "MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev",
            {"pname": request.concept, "ev": json.dumps(cached["evidences"])}
        )
        if not request.project_id:
            db.query(
                "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
                {"pid": p_id, "cname": request.concept}
            )
        return {
            "project_id": p_id,
            "parent": request.concept,
            "suggestions": cached["suggestions"],
            "evidence_pointers": cached["evidences"],
            "cached": True
        }

    # RAG retrieval
    relevant_docs = vectorstore.similarity_search(request.concept, k=3)
    evidences = [
        {"title": d.metadata.get("title"), "pubid": str(d.metadata.get("pubid"))}
        for d in relevant_docs
    ]

    # Check retrieval quality — if top docs are irrelevant, skip RAG context
    # and rely on LLM knowledge instead
    context_str = "\n".join([
        f"[{d.metadata.get('pubid')}] {d.metadata.get('title', '')}: "
        f"{d.page_content[:150].replace(chr(10), ' ')}"
        for d in relevant_docs
    ])

    # ADDED: ancestor chain gives the LLM full clinical context
    ancestor_chain = " → ".join(ancestors + [request.concept]) if ancestors else request.concept

    prompt = f"""You are a medical expert. Based on the following PubMed sources about '{request.concept}', extract 5 highly specific medical subtopics.

Clinical context (concept hierarchy): {ancestor_chain}
Current concept to expand: {request.concept}

PubMed sources:
{context_str}

Rules:
- Each subtopic must be specific to '{request.concept}', not generic
- Do NOT suggest concepts already in the hierarchy: {', '.join(ancestors) if ancestors else 'none'}
- Use the clinical context to guide specificity

Return ONLY valid JSON:
{{"subtopics":[{{"term":"specific_medical_term","evidence_pubid":"pubid_from_sources"}}]}}"""

    suggestions_data = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"num_predict": 250, "temperature": 0.3}
                }
            )
            parsed = json.loads(res.json().get("response", "{}"))
            subs = parsed.get("subtopics", [])

            for item in subs:
                if isinstance(item, dict) and "term" in item:
                    ev = []
                    if item.get("evidence_pubid"):
                        ev.append({
                            "title": next(
                                (e["title"] for e in evidences
                                 if str(e["pubid"]) == str(item["evidence_pubid"])),
                                "Source Document"
                            ),
                            "pubid": str(item["evidence_pubid"])
                        })
                    suggestions_data.append({
                        "name": item["term"],
                        "evidence": json.dumps(ev)
                    })

        except Exception as e:
            logger.error(f"LLM generation failed: {type(e).__name__}: {e}")

    # FIXED: if LLM failed or returned empty, use intelligent fallback
    # instead of hardcoded generic strings
    if not suggestions_data:
        logger.warning(f"Using LLM fallback for '{request.concept}'")
        suggestions_data = await generate_llm_fallback(request.concept, ancestors)

    # Only cache if we got real suggestions
    if suggestions_data:
        _suggestion_cache[ck] = {"suggestions": suggestions_data, "evidences": evidences}
        save_cache(_suggestion_cache)

    # Neo4j save — unchanged
    db.query(
        "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
        {"pid": p_id, "title": f"Exploration: {request.concept}", "date": datetime.now().isoformat()}
    )
    db.query("""
        MERGE (parent:Concept {name: $pname})
        SET parent.evidence = $ev
    """, {"pname": request.concept, "ev": json.dumps(evidences)})

    if not request.project_id:
        db.query(
            "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
            {"pid": p_id, "cname": request.concept}
        )

    return {
        "project_id": p_id,
        "parent": request.concept,
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
        "MATCH (p:Project) RETURN p.id as id, p.title as title ORDER BY p.created_at DESC"
    )
    return [dict(r) for r in results]


@app.post("/fetch-full-evidence")
async def fetch_full_evidence(request: dict):
    try:
        handle = Entrez.efetch(db="pubmed", id=request["pubid"], rettype="abstract", retmode="text")
        return {"full_content": handle.read()}
    except Exception as e:
        return {"error": str(e)}



class StagedSuggestRequest(BaseModel):
    symptom: str          # the original root symptom
    concept: str          # the node being expanded
    stage: str            # differential | mechanism | workup | treatment | monitoring
    accepted_nodes: Optional[List[str]] = []
    project_id: Optional[str] = None
STAGE_PROMPTS = {
    "differential": """You are an experienced clinician. A patient presents with: '{symptom}'.

Generate exactly 5 differential diagnoses ranked from most to least likely.
Each must be a specific named medical condition, not a symptom or category.
Consider common causes first, then serious conditions that must not be missed.

Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"Most_Likely_Diagnosis","likelihood":"common"}},
  {{"term":"Second_Diagnosis","likelihood":"common"}},
  {{"term":"Third_Diagnosis","likelihood":"less_common"}},
  {{"term":"Fourth_Diagnosis","likelihood":"less_common"}},
  {{"term":"Must_Not_Miss_Diagnosis","likelihood":"rare_but_critical"}}
]}}""",

    "mechanism": """You are a medical pathophysiologist. 
Symptom: '{symptom}'
Working diagnosis: '{concept}'

Explain the pathophysiology of '{concept}' in 5 specific mechanistic steps or processes.
Each must be a concrete biological mechanism, not a vague category.
Example good answer: "Inflammatory cytokine release → mucosal barrier disruption"
Example bad answer: "Inflammation"

Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"Specific_Mechanism_1"}},
  {{"term":"Specific_Mechanism_2"}},
  {{"term":"Specific_Mechanism_3"}},
  {{"term":"Specific_Mechanism_4"}},
  {{"term":"Specific_Mechanism_5"}}
]}}""",

    "workup": """You are a clinical diagnostician.
Symptom: '{symptom}'
Working diagnosis: '{concept}'

List exactly 5 specific diagnostic tests or clinical assessments to confirm '{concept}'.
Order them by clinical priority (most important first).
Each must be a specific named test, not a category.
Example good: "Troponin I serum level", "12-lead ECG", "CT pulmonary angiography"
Example bad: "Blood tests", "Imaging"

Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"First_Priority_Test"}},
  {{"term":"Second_Priority_Test"}},
  {{"term":"Third_Priority_Test"}},
  {{"term":"Fourth_Priority_Test"}},
  {{"term":"Fifth_Priority_Test"}}
]}}""",

    "treatment": """You are a clinical pharmacologist and internist.
Symptom: '{symptom}'
Confirmed diagnosis: '{concept}'

List exactly 5 specific evidence-based treatments for '{concept}'.
Include both first-line and second-line options where relevant.
Mix pharmacological and non-pharmacological where appropriate.
Each must be a specific treatment name, not a category.
Example good: "Aspirin 325mg loading dose", "Primary PCI within 90 minutes"
Example bad: "Pain management", "Surgery"

Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"First_Line_Treatment_1"}},
  {{"term":"First_Line_Treatment_2"}},
  {{"term":"Second_Line_Treatment_3"}},
  {{"term":"Second_Line_Treatment_4"}},
  {{"term":"Supportive_Treatment_5"}}
]}}""",

    "monitoring": """You are a clinical specialist in follow-up care.
Symptom: '{symptom}'
Treated condition: '{concept}'

List exactly 5 specific monitoring parameters, follow-up markers, or complications to watch for '{concept}' after treatment.
Each must be specific and measurable.
Example good: "Serial troponin levels at 3h and 6h", "30-day MACE event rate"
Example bad: "Monitor patient", "Check labs"

Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"Monitoring_Parameter_1"}},
  {{"term":"Monitoring_Parameter_2"}},
  {{"term":"Complication_To_Watch_3"}},
  {{"term":"Follow_Up_Marker_4"}},
  {{"term":"Prognosis_Indicator_5"}}
]}}"""
}

@app.post("/suggest-staged")
async def suggest_staged(request: StagedSuggestRequest):
    p_id = request.project_id or str(uuid.uuid4())
    ck = f"staged_{request.stage}_{request.concept.lower().strip()}"

    # Cache hit
    if ck in _suggestion_cache:
        logger.info(f"Cache hit (staged): '{ck}'")
        cached = _suggestion_cache[ck]
        db.query(
            "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
            {"pid": p_id, "title": f"Clinical: {request.symptom}", "date": datetime.now().isoformat()}
        )
        db.query(
            "MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev, parent.stage = $stage",
            {"pname": request.concept, "ev": json.dumps(cached["evidences"]), "stage": request.stage}
        )
        if not request.project_id:
            db.query(
                "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
                {"pid": p_id, "cname": request.concept}
            )
        return {
            "project_id": p_id,
            "parent": request.concept,
            "stage": request.stage,
            "suggestions": cached["suggestions"],
            "evidence_pointers": cached["evidences"],
            "cached": True
        }

    # FIXED: Pure LLM reasoning — no RAG context for clinical stages
    # RAG hurts here because 10k QA dataset doesn't have structured clinical content
    # Mistral's medical training is more reliable for differential dx, workup, treatment
    prompt_template = STAGE_PROMPTS.get(request.stage, STAGE_PROMPTS["differential"])
    prompt = prompt_template.format(
        symptom=request.symptom,
        concept=request.concept
    )

    suggestions_data = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {
                        "num_predict": 300,
                        "temperature": 0.2  # low temp = more precise clinical answers
                    }
                }
            )
            raw = res.json().get("response", "{}")
            logger.info(f"Staged LLM raw: {raw[:200]}")
            parsed = json.loads(raw)
            subs = parsed.get("subtopics", [])

            for item in subs:
                if isinstance(item, dict) and "term" in item:
                    # For differential, add likelihood tag to label
                    term = item["term"]
                    if request.stage == "differential" and "likelihood" in item:
                        likelihood = item["likelihood"]
                        if likelihood == "rare_but_critical":
                            term = f"⚠ {term}"
                    suggestions_data.append({
                        "name": term,
                        "evidence": "[]",
                        "stage": request.stage
                    })

        except Exception as e:
            logger.error(f"Staged LLM failed: {type(e).__name__}: {e}")

    # Fallback if LLM failed
    if not suggestions_data:
        logger.warning(f"Using fallback for staged '{request.stage}' on '{request.concept}'")
        suggestions_data = await generate_llm_fallback(request.concept, [request.symptom])

    # After getting suggestions, use RAG only to find supporting evidence links
    # This keeps evidence pointers without letting bad RAG contaminate suggestions
    try:
        search_query = f"{request.symptom} {request.concept}"
        relevant_docs = vectorstore.similarity_search(search_query, k=2)
        evidences = [
            {"title": d.metadata.get("title"), "pubid": str(d.metadata.get("pubid"))}
            for d in relevant_docs
        ]
    except Exception:
        evidences = []

    if suggestions_data:
        _suggestion_cache[ck] = {"suggestions": suggestions_data, "evidences": evidences}
        save_cache(_suggestion_cache)

    # Neo4j save
    db.query(
        "MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
        {"pid": p_id, "title": f"Clinical: {request.symptom}", "date": datetime.now().isoformat()}
    )
    db.query("""
        MERGE (parent:Concept {name: $pname})
        SET parent.evidence = $ev, parent.stage = $stage
    """, {
        "pname": request.concept,
        "ev": json.dumps(evidences),
        "stage": request.stage
    })

    if not request.project_id:
        db.query(
            "MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)",
            {"pid": p_id, "cname": request.concept}
        )

    return {
        "project_id": p_id,
        "parent": request.concept,
        "stage": request.stage,
        "suggestions": suggestions_data,
        "evidence_pointers": evidences
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)