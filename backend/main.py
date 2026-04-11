import json
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Smart Mind Map Generator API")

# --- 1. CORS CONFIGURATION ---
# This allows your React app (typically on port 5173) to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
 # If running inside Docker, change localhost to host.docker.internal
OLLAMA_URL = "http://host.docker.internal:11434/api/generate"
MODEL_NAME = "phi"

# --- 4. ROUTES ---

@app.get("/")
async def health_check():
    return {"status": "online", "model": MODEL_NAME}

@app.post("/suggest", response_model=SuggestionResponse)
async def get_suggestions(request: ConceptRequest):
    """
    Sends a concept to Ollama and returns 5 structured subtopics.
    """
    prompt = f"""
    You are a professional brainstorming assistant.
    Provide 5 distinct subtopics or related concepts for: '{request.concept}'.
    
    Constraint: You must return ONLY a JSON object.
    Required Format: {{ "subtopics": ["string1", "string2", "string3", "string4", "string5"] }}
    """

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
                timeout=60.0 # AI can take a while to "think"
            )
            
            response.raise_for_status()
            result = response.json()
            
            # Ollama returns the AI text in the "response" field
            raw_ai_text = result.get("response", "")
            
            # Convert the string from the AI into a Python dictionary
            data = json.loads(raw_ai_text)
            suggestions = data.get("subtopics", [])

            # Ensure we return exactly what the frontend expects
            return {
                "parent": request.concept,
                "suggestions": suggestions[:5]
            }

        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Ollama service is not running.")
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="AI failed to generate valid JSON.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)