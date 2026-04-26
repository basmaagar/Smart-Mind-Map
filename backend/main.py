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

# RAG & LangChain
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore

# Configuration des logs
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
Entrez.email = "your_email@example.com"

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
        if not self.driver: return []
        with self.driver.session() as session:
            return list(session.run(query, parameters))

db = Neo4jHandler()
app = FastAPI(title="MedMind OS - Kernel")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SuggestRequest(BaseModel):
    concept: str
    project_id: Optional[str] = None

# --- RAG INITIALIZATION ---
logger.info("Loading RAG assets...")
embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
index = faiss.read_index("med_knowledge.index")
with open("med_texts.pkl", "rb") as f:
    docs = pickle.load(f)
docstore = InMemoryDocstore({str(i): d for i, d in enumerate(docs)})
vectorstore = FAISS(embeddings_model, index, docstore, {i: str(i) for i in range(len(docs))})

# --- API ROUTES ---

@app.get("/projects/{project_id}")
async def get_project_graph(project_id: str):
    query = """
    MATCH (p:Project {id: $pid})-[:HAS_ROOT]->(n:Concept)
    OPTIONAL MATCH (n)-[r:RELATED_TO]->(m:Concept)
    RETURN n, r, m
    """
    results = db.query(query, {"pid": project_id})
    elements = []
    added_ids = set()

    for record in results:
        # Traitement des Nœuds
        for key in ["n", "m"]:
            node = record[key]
            if node:
                # On utilise le nom en minuscule comme ID unique et robuste
                u_id = str(node["name"]).lower().strip()
                if u_id not in added_ids:
                    ev = json.loads(node["evidence"]) if "evidence" in node else []
                    elements.append({
                        "group": "nodes",
                        "data": { "id": u_id, "label": node["name"], "evidence": ev }
                    })
                    added_ids.add(u_id)
        
        # Traitement des Liens (Edges)
        if record.get("r") is not None and record.get("n") is not None and record.get("m") is not None:
            source_id = str(record["n"]["name"]).lower().strip()
            target_id = str(record["m"]["name"]).lower().strip()
            
            # On ne crée le lien que si la source et la cible existent
            elements.append({
                "group": "edges",
                "data": {
                    "id": f"edge-{source_id}-{target_id}", # ID unique pour l'arête
                    "source": source_id, 
                    "target": target_id
                }
            })
    
    # Log pour déboguer (vérifie tes terminaux)
    print(f"Envoi de {len(elements)} éléments pour le projet {project_id}")
    return elements
@app.post("/suggest")
async def suggest_and_save(request: SuggestRequest):
    p_id = request.project_id or str(uuid.uuid4())
    
    # RAG Search
    relevant_docs = vectorstore.similarity_search(request.concept, k=5)
    evidences = [{"title": d.metadata.get("title"), "pubid": str(d.metadata.get("pubid"))} for d in relevant_docs]
    
    # Construction du contexte pour Mistral
    context_lines = []
    for d in relevant_docs:
        pubid = str(d.metadata.get("pubid"))
        title = d.metadata.get("title", "")
        content = d.page_content[:300].replace("\n", " ") # Extrait pour le LLM
        context_lines.append(f"Doc ID: {pubid} | Title: {title}\nSnippet: {content}")
    context_str = "\n\n".join(context_lines)

    # LLM Generation via Ollama
    prompt = f"""You are a medical expert. Based on the following documents about '{request.concept}', extract 5 highly specific sub-concepts.
Context:
{context_str}

For each sub-concept, specify the exact document that justifies it (why it was chosen).
Return ONLY valid JSON:
{{
  "subtopics": [
    {{
      "term": "specific_term_1",
      "evidence_title": "Title of the document from context",
      "evidence_pubid": "Doc ID from context"
    }}
  ]
}}"""
    
    suggestions_data = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            res = await client.post("http://localhost:11434/api/generate", 
                                  json={"model": "mistral", "prompt": prompt, "format": "json", "stream": False})
            parsed = json.loads(res.json().get("response", "{}"))
            subs = parsed.get("subtopics", [])
            for item in subs:
                if isinstance(item, dict) and "term" in item:
                    term = item["term"]
                    ev = []
                    if "evidence_pubid" in item and item["evidence_pubid"]:
                        ev.append({
                            "title": item.get("evidence_title", "Source Document"),
                            "pubid": str(item["evidence_pubid"])
                        })
                    suggestions_data.append({"name": term, "evidence": json.dumps(ev)})
                elif isinstance(item, str):
                    # Fallback
                    suggestions_data.append({"name": item, "evidence": "[]"})
        except Exception as e:
            logger.error(f"Mistral Error: {e}")
            suggestions_data = [
                {"name": f"{request.concept} mechanisms", "evidence": "[]"},
                {"name": f"{request.concept} clinical cases", "evidence": "[]"}
            ]

    # Sauvegarde du Projet
    db.query("MERGE (p:Project {id: $pid}) ON CREATE SET p.title = $title, p.created_at = $date",
             {"pid": p_id, "title": f"Exploration: {request.concept}", "date": datetime.now().isoformat()})

    # Sauvegarde des Concepts et des Relations
    db.query("""
        MERGE (parent:Concept {name: $pname})
        SET parent.evidence = $ev
        WITH parent
        UNWIND $children as child_data
        MERGE (child:Concept {name: child_data.name})
        SET child.evidence = child_data.evidence
        MERGE (parent)-[:RELATED_TO]->(child)
    """, {"pname": request.concept, "children": suggestions_data, "ev": json.dumps(evidences)})

    # Liaison Racine
    if not request.project_id:
        db.query("MATCH (p:Project {id: $pid}) MATCH (c:Concept {name: $cname}) MERGE (p)-[:HAS_ROOT]->(c)", 
                 {"pid": p_id, "cname": request.concept})

    suggested_names = [item["name"] for item in suggestions_data]
    return {"project_id": p_id, "suggestions": suggested_names, "evidence_pointers": evidences}

@app.get("/projects")
async def list_projects():
    results = db.query("MATCH (p:Project) RETURN p.id as id, p.title as title ORDER BY p.created_at DESC")
    return [dict(r) for r in results]

@app.post("/fetch-full-evidence")
async def fetch_full_evidence(request: dict):
    try:
        handle = Entrez.efetch(db="pubmed", id=request["pubid"], rettype="abstract", retmode="text")
        return {"full_content": handle.read()}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)