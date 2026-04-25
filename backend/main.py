import json
import httpx
import faiss
import pickle
import uvicorn
import logging
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from Bio import Entrez
from typing import List

# --- IMPORTS CRITIQUES ---
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv
from langchain_community.docstore.in_memory import InMemoryDocstore

# Configuration des logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Smart Medical Agent API")

# Load environment variables from .env file
load_dotenv()

# --- 1. CONFIGURATION CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION PUBMED (NCBI) ---
Entrez.email = os.getenv("ENTREZ_EMAIL")
Entrez.api_key = os.getenv("ENTREZ_API_KEY")

class ConceptRequest(BaseModel):
    concept: str

class EvidenceRequest(BaseModel):
    pubid: str

# --- 2. CHARGEMENT DU RAG ---
logger.info("Initialisation du RAG...")

def load_vectorstore():
    try:
        embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        index = faiss.read_index("med_knowledge.index")
        with open("med_texts.pkl", "rb") as f:
            docs = pickle.load(f)
        docstore = InMemoryDocstore({str(i): d for i, d in enumerate(docs)})
        id_map = {i: str(i) for i in range(len(docs))}
        vs = FAISS(embeddings_model, index, docstore, id_map)
        logger.info(f"✅ RAG prêt avec {len(docs)} documents.")
        return vs
    except Exception as e:
        logger.error(f"❌ Erreur critique chargement RAG: {e}")
        return None

vectorstore = load_vectorstore()

# --- 3. ROUTES ---

@app.post("/suggest")
async def get_suggestions(request: ConceptRequest):
    logger.info(f"Requête reçue : {request.concept}")
    
    if not vectorstore:
        raise HTTPException(status_code=500, detail="Base de données vectorielle non chargée.")

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

        context_text = evidences[0]['preview'] if evidences else "Pas de contexte spécifique trouvé."
        prompt = f"""
        [INST] Tu es un expert médical spécialisé en synthèse de connaissances.
        En te basant sur ce contexte : {context_text}
        Génère 5 sous-sujets (noms de branches) pour explorer le concept : '{request.concept}'.
        Réponds UNIQUEMENT en JSON sous la forme : {{"subtopics": ["...", "...", "...", "...", "..."]}} [/INST]
        """

        async with httpx.AsyncClient(timeout=None) as client:
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
                ai_data = response.json()
                ai_output = json.loads(ai_data.get("response", "{}"))
                return {
                    "parent": request.concept,
                    "suggestions": ai_output.get("subtopics", []),
                    "evidence_pointers": evidences
                }
            else:
                raise Exception("Erreur de réponse Ollama")

    except Exception as e:
        logger.warning(f"Mode secours activé (Erreur: {e})")
        return {
            "parent": request.concept,
            "suggestions": ["Pathologie", "Diagnostic", "Traitement", "Épidémiologie", "Recherche"],
            "evidence_pointers": evidences if 'evidences' in locals() else []
        }

@app.post("/fetch-full-evidence")
async def fetch_full_evidence(request: EvidenceRequest):
    try:
        # L'utilisation de la clé API est automatique ici grâce à Entrez.api_key défini plus haut
        handle = Entrez.efetch(db="pubmed", id=request.pubid, rettype="abstract", retmode="text")
        full_text = handle.read()
        handle.close()
        return {"pubid": request.pubid, "full_content": full_text}
    except Exception as e:
        logger.error(f"Erreur PubMed: {e}")
        raise HTTPException(status_code=500, detail="Erreur de connexion à PubMed.")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)