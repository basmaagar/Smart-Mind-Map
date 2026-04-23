import json
import httpx
import faiss
import pickle
import uvicorn
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from Bio import Entrez
from typing import List

# Configuration des logs pour voir ce qui se passe dans la console
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart Medical Agent API")

# --- 1. CONFIGURATION CORS RENFORCÉE ---
# On autorise explicitement les ports courants de Vite (5173, 5174, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration Entrez (PubMed)
Entrez.email = "votre_email@example.com" 

class ConceptRequest(BaseModel):
    concept: str

class EvidenceRequest(BaseModel):
    pubid: str

# --- 2. CHARGEMENT DU RAG ---
logger.info("Initialisation du RAG...")
try:
    embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    index = faiss.read_index("med_knowledge.index")
    with open("med_texts.pkl", "rb") as f:
        docs = pickle.load(f)
    
    from langchain_community.docstore.in_memory import InMemoryDocstore
    docstore = InMemoryDocstore({str(i): d for i, d in enumerate(docs)})
    id_map = {i: str(i) for i in range(len(docs))}
    
    from langchain_community.vectorstores import FAISS
    vectorstore = FAISS(embeddings_model, index, docstore, id_map)
    logger.info("✅ RAG prêt et index chargé.")
except Exception as e:
    logger.error(f"❌ Erreur critique chargement RAG: {e}")
    vectorstore = None

# --- 3. ROUTES ---

@app.post("/suggest")
async def get_suggestions(request: ConceptRequest):
    logger.info(f"Requête reçue pour le concept : {request.concept}")
    
    if not vectorstore:
        raise HTTPException(status_code=500, detail="Système de recherche non disponible.")

    # A. Recherche sémantique
    try:
        relevant_docs = vectorstore.similarity_search(request.concept, k=2)
        evidences = [
            {
                "title": d.metadata.get("title", "Article PubMed"),
                "pubid": str(d.metadata.get("pubid", "")),
                "url": d.metadata.get("pdf_link", ""),
                "preview": d.page_content[:200] + "..."
            } for d in relevant_docs
        ]
    except Exception as e:
        logger.error(f"Erreur recherche FAISS: {e}")
        evidences = []

    # B. Appel Ollama avec gestion du Timeout
    context_text = evidences[0]['preview'] if evidences else "Pas de contexte."
    prompt = f"""
    [INST] Tu es un assistant médical. Basé sur ce contexte : {context_text}
    Donne 5 concepts liés à '{request.concept}' pour une carte mentale.
    Réponds UNIQUEMENT en JSON: {{"subtopics": ["concept1", "concept2", "concept3", "concept4", "concept5"]}} [/INST]
    """

    # Utilisation d'un timeout infini pour éviter le crash ReadTimeout
    async with httpx.AsyncClient(timeout=None) as client:
        try:
            logger.info("Appel à Ollama en cours...")
            response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "mistral",
                    "prompt": prompt,
                    "format": "json",
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_output = json.loads(result.get("response", "{}"))
                return {
                    "parent": request.concept,
                    "suggestions": ai_output.get("subtopics", []),
                    "evidence_pointers": evidences
                }
            else:
                raise Exception(f"Ollama a répondu avec le code {response.status_code}")

        except Exception as e:
            logger.warning(f"Ollama indisponible ou trop lent : {e}")
            # Fallback pour ne pas bloquer le frontend
            return {
                "parent": request.concept,
                "suggestions": [f"{request.concept} - Études", "Diagnostic", "Pathologie", "Traitements", "Prévention"],
                "evidence_pointers": evidences,
                "note": "Suggestions générées par mode secours (IA indisponible)."
            }

@app.post("/fetch-full-evidence")
async def fetch_full_evidence(request: EvidenceRequest):
    try:
        handle = Entrez.efetch(db="pubmed", id=request.pubid, rettype="abstract", retmode="text")
        full_text = handle.read()
        handle.close()
        return {"pubid": request.pubid, "full_content": full_text}
    except Exception as e:
        logger.error(f"Erreur PubMed: {e}")
        raise HTTPException(status_code=500, detail="Impossible de joindre PubMed.")

if __name__ == "__main__":
    from langchain_huggingface import HuggingFaceEmbeddings # Import ici pour éviter les erreurs au démarrage
    uvicorn.run(app, host="127.0.0.1", port=8000)