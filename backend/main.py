import json
import httpx
import faiss
import pickle
import numpy as np
import uvicorn
from pathlib import Path
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# LangChain imports
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain_community.docstore.in_memory import InMemoryDocstore

app = FastAPI(title="Smart Medical Mind Map API")

# --- 1. CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. DATA MODELS ---
class ConceptRequest(BaseModel):
    concept: str

class SuggestionResponse(BaseModel):
    parent: str
    suggestions: List[str]

# --- 3. CONSTANTS ---
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "phi"  

# --- 4. RAG SETUP ---
embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

def load_vectorstore():
    index_path = Path("med_knowledge.index")
    pkl_path = Path("med_texts.pkl")
    
    if not index_path.exists() or not pkl_path.exists():
        print("⚠️ Fichiers RAG manquants. Mode sans connaissances activé.")
        return None

    try:
        # Charger l'index FAISS natif
        faiss_index = faiss.read_index(str(index_path))
        # Charger les textes
        with open(pkl_path, "rb") as f:
            texts = pickle.load(f)
        
        # Reconstruire le vectorstore LangChain à partir de l'index existant
        docstore = InMemoryDocstore({
            str(i): Document(page_content=text) for i, text in enumerate(texts)
        })
        index_to_docstore_id = {i: str(i) for i in range(len(texts))}
        
        return FAISS(
            embedding_function=embeddings_model,
            index=faiss_index,
            docstore=docstore,
            index_to_docstore_id=index_to_docstore_id
        )
    except Exception as e:
        print(f"❌ Erreur lors de l'initialisation du VectorStore: {e}")
        return None

vectorstore = load_vectorstore()

# --- 5. ROUTES ---

@app.post("/suggest", response_model=SuggestionResponse)
async def get_suggestions(request: ConceptRequest):
    context = ""
    if vectorstore:
        try:
            # Recherche de documents pertinents
            docs = vectorstore.similarity_search(request.concept, k=3)
            context = "\n".join([doc.page_content for doc in docs])
        except Exception as e:
            print(f"Erreur de recherche RAG: {e}")

    # Prompt optimisé pour PHI (très sensible au format)
    prompt = f"""Instructions: You are a medical expert. 
Using the context below, provide 5 subtopics for the concept '{request.concept}'.

Context:
{context}

Response must be ONLY a valid JSON object.
Format: {{"subtopics": ["topic1", "topic2", "topic3", "topic4", "topic5"]}}"""

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                OLLAMA_URL,
                json={
                    "model": MODEL_NAME,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False
                },
                timeout=60.0
            )
            response.raise_for_status()
            raw_response = response.json().get("response", "{}")
            
            # Parsing sécurisé
            data = json.loads(raw_response)
            suggestions = data.get("subtopics", [])
            
            return {
                "parent": request.concept,
                "suggestions": suggestions[:5]
            }

        except Exception as e:
            print(f"Error: {e}")
            raise HTTPException(status_code=500, detail="Erreur interne du serveur ou Ollama.")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)