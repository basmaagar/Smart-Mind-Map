import json
import httpx
import uvicorn
import uuid
import os
import re
import asyncio
import logging
import xml.etree.ElementTree as ET
import bcrypt
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from jose import JWTError, jwt
from Bio import Entrez
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi")
BIOPORTAL_API_KEY = os.getenv("BIOPORTAL_API_KEY", "")
CACHE_FILE = "suggestion_cache.json"
Entrez.email = os.getenv("ENTREZ_EMAIL", "your_email@example.com")

SECRET_KEY = os.getenv("SECRET_KEY", "medmind-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
BIOPORTAL_ONTOLOGIES = "DOID,MESH,SNOMEDCT,NCI,HP"

logger.info(f"BioPortal key set: {bool(BIOPORTAL_API_KEY)}")
logger.info(f"Ollama model: {OLLAMA_MODEL}")

# --- AUTH UTILITIES ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        plain.encode('utf-8'),
        hashed.encode('utf-8')
    )

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

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
_bioportal_cache: dict = {}
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

    async def query(self, query, parameters=None):
        if not self.driver:
            logger.warning("Database query skipped: No active Neo4j connection.")
            return []
        return await asyncio.to_thread(self._run_query, query, parameters)

    def _run_query(self, query, parameters=None):
        try:
            with self.driver.session() as session:
                return list(session.run(query, parameters))
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            return []

    def close(self):
        if self.driver:
            self.driver.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create Neo4j constraints on startup for data integrity
    await db.query("CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE")
    await db.query("CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE")
    await db.query("CREATE CONSTRAINT project_id_unique IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE")
    logger.info("Neo4j constraints verified.")
    yield
    logger.info("Shutting down: closing Neo4j connection.")
    db.close()

db = Neo4jHandler()
app = FastAPI(title="MedMind OS - Kernel", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = ""

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_email: str
    full_name: str

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

class SaveArticleRequest(BaseModel):
    pubid: str
    title: str

PLACEHOLDER_TERMS = {
    "specific_medical_term", "real_medical_term_here",
    "specific_mechanism", "specific_test", "specific_treatment",
    "monitoring_parameter", "diagnosis_name", "most_likely_diagnosis",
    "second_diagnosis", "third_diagnosis", "fourth_diagnosis",
    "must_not_miss", "must_not_miss_diagnosis", "write_actual_medical_term",
    "specific_medical_subtopic", "write_actual_pmid", "pmid_from_above",
    "pmid", "term", "none", "actual_medical_term", "actual_mechanism_name",
    "actual_test_name", "actual_treatment_name", "actual_parameter_name",
    "actual_disease_name", "write_real_medical_term_here", "fill_with_real_term"
}

# --- AUTH DEPENDENCY ---
async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        if user_id is None or email is None:
            raise credentials_exception
        return {"user_id": user_id, "email": email}
    except JWTError:
        raise credentials_exception

# --- NEO4J HELPER: link project to user atomically ---
async def link_project_to_user(user_id: str, project_id: str, title: str, date: str):
    """
    FIXED: Single atomic query that creates/merges the Project node
    AND creates the OWNS relationship in one operation.
    The previous two-query approach (MERGE project, then MATCH user MATCH project MERGE rel)
    failed silently when the project didn't exist yet at relationship creation time.
    """
    await db.query("""
        MATCH (u:User {id: $uid})
        MERGE (p:Project {id: $pid})
        ON CREATE SET p.title = $title, p.created_at = $date
        MERGE (u)-[:OWNS]->(p)
    """, {
        "uid": user_id,
        "pid": project_id,
        "title": title,
        "date": date
    })

# --- BIOPORTAL ---
async def get_bioportal_context(concept: str) -> dict:
    if not BIOPORTAL_API_KEY:
        return {
            "synonyms": [], "semantic_type": None,
            "parents": [], "definition": None,
            "ontology_id": None, "ontology_name": None, "concept_uri": None
        }

    ck = concept.lower().strip()
    if ck in _bioportal_cache:
        return _bioportal_cache[ck]

    result = {
        "synonyms": [], "semantic_type": None,
        "parents": [], "definition": None,
        "ontology_id": None, "ontology_name": None, "concept_uri": None
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://data.bioontology.org/search",
                params={
                    "q": concept,
                    "ontologies": BIOPORTAL_ONTOLOGIES,
                    "include": "prefLabel,synonym,semanticType,definition,properties",
                    "require_exact_match": "false",
                    "pagesize": 3,
                    "apikey": BIOPORTAL_API_KEY
                },
                headers={"Accept": "application/json"}
            )
            if res.status_code != 200:
                return result

            data = res.json()
            collection = data.get("collection", [])
            if not collection:
                return result

            best = collection[0]
            raw_synonyms = best.get("synonym", [])
            result["synonyms"] = list(set([
                s.strip() for s in raw_synonyms
                if s.strip().lower() != concept.lower() and len(s.strip()) > 2
            ]))[:4]

            semantic_types = best.get("semanticType", [])
            if semantic_types:
                result["semantic_type"] = semantic_types[0]

            definitions = best.get("definition", [])
            if definitions:
                result["definition"] = definitions[0][:300] if definitions[0] else None

            links = best.get("links", {})
            ontology_link = links.get("ontology", "")
            if ontology_link:
                result["ontology_id"] = ontology_link.split("/ontologies/")[-1]

            result["concept_uri"] = best.get("@id", None)
            result["ontology_name"] = best.get("prefLabel", concept)

            parents = best.get("parents", [])
            if isinstance(parents, list):
                result["parents"] = [
                    p["prefLabel"] for p in parents[:2]
                    if isinstance(p, dict) and "prefLabel" in p
                ]

        _bioportal_cache[ck] = result
        return result

    except Exception as e:
        logger.error(f"BioPortal error for '{concept}': {type(e).__name__}: {e}")
        return result


def build_enriched_pubmed_query(concept, bioportal_context, graph_context, ancestors):
    terms = [concept]
    synonyms = bioportal_context.get("synonyms", [])[:2]
    terms.extend(synonyms)
    base_query = " OR ".join(f'"{t}"' for t in terms) if len(terms) > 1 else concept
    if ancestors:
        base_query = f"({base_query}) AND {ancestors[-1]}"
    depth = graph_context.get("depth", 0)
    if depth == 0:
        base_query += " AND (overview OR pathophysiology OR etiology)"
    elif depth == 1:
        base_query += " AND (mechanism OR clinical)"
    else:
        base_query += " AND (treatment OR outcome OR management)"
    return base_query


def build_bioportal_evidence(bioportal_context: dict, concept: str) -> dict:
    ontology_id = bioportal_context.get("ontology_id")
    if not ontology_id:
        return None
    return {
        "source": "bioportal",
        "ontology_id": ontology_id,
        "ontology_name": bioportal_context.get("ontology_name", concept),
        "semantic_type": bioportal_context.get("semantic_type"),
        "definition": bioportal_context.get("definition"),
        "concept_uri": bioportal_context.get("concept_uri"),
        "synonyms": bioportal_context.get("synonyms", [])
    }


async def fetch_clinical_trials(concept: str, max_results: int = 3) -> list:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://clinicaltrials.gov/api/v2/studies",
                params={
                    "query.cond": concept,
                    "pageSize": max_results,
                    "format": "json",
                    "fields": "NCTId,BriefTitle,OverallStatus,Phase,LeadSponsorName"
                },
                headers={"Accept": "application/json"}
            )
            if res.status_code != 200:
                return []

            data = res.json()
            studies = data.get("studies", [])
            trials = []
            for study in studies:
                proto = study.get("protocolSection", {})
                id_module = proto.get("identificationModule", {})
                status_module = proto.get("statusModule", {})
                design_module = proto.get("designModule", {})
                sponsor_module = proto.get("sponsorCollaboratorsModule", {})
                nct_id = id_module.get("nctId", "")
                title = id_module.get("briefTitle", "No title")
                ct_status = status_module.get("overallStatus", "Unknown")
                phases = design_module.get("phases", [])
                phase = phases[0] if phases else "N/A"
                sponsor = sponsor_module.get("leadSponsor", {}).get("name", "")
                if nct_id:
                    trials.append({
                        "nct_id": nct_id, "title": title,
                        "status": ct_status, "phase": phase,
                        "sponsor": sponsor,
                        "url": f"https://clinicaltrials.gov/study/{nct_id}"
                    })
            logger.info(f"ClinicalTrials: {len(trials)} trials for '{concept}'")
            return trials
    except Exception as e:
        logger.error(f"ClinicalTrials API error: {type(e).__name__}: {e}")
        return []


def build_clinical_trials_evidence(trials: list) -> dict:
    if not trials:
        return None
    return {"source": "clinicaltrials", "trials": trials}


def build_suggestions(
    items, docs, stage=None, existing=None,
    bioportal_evidence=None, ct_evidence=None
):
    existing = existing or []
    suggestions = []
    for item in items:
        if not isinstance(item, dict) or "term" not in item:
            continue
        term = str(item["term"]).strip()
        if not term:
            continue
        normalized = term.lower().replace(" ", "_").strip("⚠ ")
        if normalized in PLACEHOLDER_TERMS:
            continue
        if re.match(r'^actual[_ ]medical[_ ]term[_ ]*\d*$', normalized):
            continue
        if re.match(r'^(actual|specific|real|sample|example|placeholder)[_ ].+[_ ]*\d+$', normalized):
            continue
        if len(term) < 3 or term.startswith("{") or term.startswith("["):
            continue
        if any(term.lower() == ex.lower() for ex in existing):
            continue
        if stage == "differential" and item.get("likelihood") == "rare_but_critical":
            term = f"⚠ {term}"
        evidence_pubid = str(item.get("evidence_pubid", "")).strip()
        matching = None
        if evidence_pubid and evidence_pubid.lower() not in {"pmid", "pmid_from_above", "none", ""}:
            matching = next(
                (d for d in docs if str(d["pubid"]).strip() == evidence_pubid), None
            )
            if not matching:
                matching = next(
                    (d for d in docs if
                     evidence_pubid in str(d["pubid"]) or
                     str(d["pubid"]) in evidence_pubid), None
                )
        if not matching and docs:
            matching = docs[0]
        ev = []
        if matching:
            ev.append({"source": "pubmed", "title": matching["title"], "pubid": matching["pubid"]})
        if bioportal_evidence:
            ev.append(bioportal_evidence)
        if ct_evidence:
            ev.append(ct_evidence)
        result = {"name": term, "evidence": json.dumps(ev)}
        if stage:
            result["stage"] = stage
        suggestions.append(result)
    return suggestions


async def get_graph_context(
    concept: str,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None
) -> dict:
    context = {
        "existing_nodes": [], "siblings": [],
        "depth": 0, "related_explored": [], "graph_summary": ""
    }
    try:
        if project_id and user_id:
            all_nodes_result = await db.query("""
                MATCH (u:User {id: $uid})-[:OWNS]->(p:Project {id: $pid})-[:HAS_ROOT]->(root:Concept)
                OPTIONAL MATCH (root)-[:RELATED_TO*0..]->(n:Concept)
                RETURN DISTINCT n.name as name
            """, {"pid": project_id, "uid": user_id})
            context["existing_nodes"] = [
                r["name"] for r in all_nodes_result
                if r["name"] and r["name"] != concept
            ]

        siblings_result = await db.query("""
            MATCH (parent:Concept)-[:RELATED_TO]->(current:Concept {name: $cname})
            MATCH (parent)-[:RELATED_TO]->(sibling:Concept)
            WHERE sibling.name <> $cname
            RETURN DISTINCT sibling.name as name
        """, {"cname": concept})
        context["siblings"] = [r["name"] for r in siblings_result if r["name"]]

        depth_result = await db.query("""
            MATCH path = (root:Concept)-[:RELATED_TO*0..]->(current:Concept {name: $cname})
            WHERE NOT ()-[:RELATED_TO]->(root)
            RETURN length(path) as depth
            ORDER BY depth DESC LIMIT 1
        """, {"cname": concept})
        if depth_result:
            context["depth"] = depth_result[0]["depth"]

        explored_result = await db.query("""
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
            f"existing={len(context['existing_nodes'])}"
        )
    except Exception as e:
        logger.error(f"Graph RAG traversal failed: {e}")
    return context


def fetch_pubmed_abstracts(query: str, max_results: int = 3) -> list:
    try:
        search_handle = Entrez.esearch(
            db="pubmed", term=f"{query}[Title/Abstract]",
            retmax=max_results, sort="relevance"
        )
        search_results = Entrez.read(search_handle)
        search_handle.close()
        pmids = search_results.get("IdList", [])
        if not pmids:
            return []

        fetch_handle = Entrez.efetch(
            db="pubmed", id=",".join(pmids), rettype="xml", retmode="xml"
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
                    docs.append({"pubid": pubid, "title": title, "abstract": abstract[:150]})
            except Exception:
                continue
        logger.info(f"PubMed fetched {len(docs)} abstracts for: {query}")
        return docs
    except Exception as e:
        logger.error(f"PubMed API error: {type(e).__name__}: {e}")
        return []


def build_context_str(docs):
    if not docs:
        return "No PubMed sources available."
    return "\n\n".join(
        f"[PMID:{d['pubid']}] {d['title']}\n{d['abstract']}"
        for d in docs
    )

def build_evidences(docs):
    return [{"title": d["title"], "pubid": d["pubid"]} for d in docs]


async def generate_llm_fallback(
    concept, ancestors, docs=None,
    bioportal_evidence=None, ct_evidence=None
):
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
                    "model": OLLAMA_MODEL, "prompt": prompt,
                    "format": "json", "stream": False,
                    "options": {"num_predict": 200, "temperature": 0.4}
                }
            )
            parsed = json.loads(res.json().get("response", "{}"))
            items = parsed.get("subtopics", [])
            if docs:
                return build_suggestions(
                    items, docs,
                    bioportal_evidence=bioportal_evidence,
                    ct_evidence=ct_evidence
                )
            return [
                {"name": item["term"], "evidence": "[]"}
                for item in items
                if isinstance(item, dict) and "term" in item
                and item["term"].lower().replace(" ", "_") not in PLACEHOLDER_TERMS
            ]
        except Exception as e:
            logger.error(f"Fallback LLM failed: {e}")
            return []


STAGE_PROMPTS = {
    "differential": """You are an experienced clinician. Patient presents with: '{symptom}'.
PubMed evidence (use ONLY these PMIDs): {context}
Ontology context: {ontology_context}
Graph context — DO NOT suggest these already-mapped concepts: {graph_summary}
Generate exactly 5 real differential diagnoses ranked most to least likely.
Write actual disease names — NOT placeholder text.
Return ONLY valid JSON:
{{"subtopics":[
  {{"term":"Real_Disease_Name","likelihood":"common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Real_Disease_Name","likelihood":"common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Real_Disease_Name","likelihood":"less_common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Real_Disease_Name","likelihood":"less_common","evidence_pubid":"ACTUAL_PMID"}},
  {{"term":"Real_Disease_Name","likelihood":"rare_but_critical","evidence_pubid":"ACTUAL_PMID"}}
]}}""",
    "mechanism": """You are a medical pathophysiologist.
Symptom: '{symptom}' | Diagnosis: '{concept}'
PubMed evidence: {context}
Ontology context: {ontology_context}
Graph context — DO NOT repeat: {graph_summary}
List 5 real pathophysiological mechanisms. Write actual mechanism names.
Return ONLY valid JSON:
{{"subtopics":[{{"term":"Real_Mechanism_Name","evidence_pubid":"ACTUAL_PMID"}}]}}""",
    "workup": """You are a clinical diagnostician.
Symptom: '{symptom}' | Diagnosis: '{concept}'
PubMed evidence: {context}
Ontology context: {ontology_context}
Graph context — DO NOT repeat: {graph_summary}
List 5 real diagnostic tests ordered by priority. Write actual test names.
Return ONLY valid JSON:
{{"subtopics":[{{"term":"Real_Test_Name","evidence_pubid":"ACTUAL_PMID"}}]}}""",
    "treatment": """You are a clinical pharmacologist.
Symptom: '{symptom}' | Diagnosis: '{concept}'
PubMed evidence: {context}
Ontology context: {ontology_context}
Graph context — DO NOT repeat: {graph_summary}
List 5 real evidence-based treatments. Write actual treatment names.
Return ONLY valid JSON:
{{"subtopics":[{{"term":"Real_Treatment_Name","evidence_pubid":"ACTUAL_PMID"}}]}}""",
    "monitoring": """You are a clinical specialist.
Symptom: '{symptom}' | Condition: '{concept}'
PubMed evidence: {context}
Ontology context: {ontology_context}
Graph context — DO NOT repeat: {graph_summary}
List 5 real monitoring parameters. Write actual parameter names.
Return ONLY valid JSON:
{{"subtopics":[{{"term":"Real_Parameter_Name","evidence_pubid":"ACTUAL_PMID"}}]}}"""
}


# ============================================================
# AUTH ROUTES
# ============================================================

@app.post("/auth/register", response_model=TokenResponse)
async def register(request: RegisterRequest):
    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )

    email = request.email.lower().strip()
    existing = await db.query(
        "MATCH (u:User {email: $email}) RETURN u",
        {"email": email}
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists"
        )

    user_id = str(uuid.uuid4())
    hashed = hash_password(request.password)
    full_name = request.full_name or ""

    await db.query("""
        CREATE (u:User {
            id: $uid,
            email: $email,
            hashed_password: $hashed,
            full_name: $full_name,
            created_at: $date
        })
    """, {
        "uid": user_id, "email": email,
        "hashed": hashed, "full_name": full_name,
        "date": datetime.now().isoformat()
    })

    token = create_access_token({"sub": user_id, "email": email})
    logger.info(f"New user registered: {email}")
    return TokenResponse(
        access_token=token, token_type="bearer",
        user_email=email, full_name=full_name
    )


@app.post("/auth/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    email = form_data.username.lower().strip()
    result = await db.query(
        "MATCH (u:User {email: $email}) RETURN u",
        {"email": email}
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    user_node = result[0]["u"]
    if not verify_password(form_data.password, user_node["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    token = create_access_token({
        "sub": user_node["id"],
        "email": user_node["email"]
    })
    logger.info(f"User logged in: {email}")
    return TokenResponse(
        access_token=token, token_type="bearer",
        user_email=user_node["email"],
        full_name=user_node.get("full_name", "")
    )


@app.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    result = await db.query(
        "MATCH (u:User {id: $uid}) RETURN u.email as email, u.full_name as full_name",
        {"uid": current_user["user_id"]}
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return {"email": result[0]["email"], "full_name": result[0]["full_name"]}


# ============================================================
# PROTECTED API ROUTES
# ============================================================

@app.get("/projects/{project_id}")
async def get_project_graph(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    ownership = await db.query(
        "MATCH (u:User {id: $uid})-[:OWNS]->(p:Project {id: $pid}) RETURN p",
        {"uid": current_user["user_id"], "pid": project_id}
    )
    if not ownership:
        raise HTTPException(status_code=403, detail="Access denied")

    results = await db.query("""
        MATCH (p:Project {id: $pid})-[:HAS_ROOT]->(root:Concept)
        OPTIONAL MATCH (n:Concept)-[r:RELATED_TO]->(m:Concept)
        WHERE (root)-[:RELATED_TO*0..]->(n)
        RETURN root, n, r, m
    """, {"pid": project_id})

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
                    "source": source_id, "target": target_id
                }
            })

    logger.info(f"Returning {len(elements)} elements for project {project_id}")
    return elements


@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    ownership = await db.query(
        "MATCH (u:User {id: $uid})-[:OWNS]->(p:Project {id: $pid}) RETURN p",
        {"uid": current_user["user_id"], "pid": project_id}
    )
    if not ownership:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        await db.query("""
            MATCH (p:Project {id: $pid})-[:HAS_ROOT]->(root:Concept)
            OPTIONAL MATCH (root)-[:RELATED_TO*0..]->(n:Concept)
            DETACH DELETE n, root, p
        """, {"pid": project_id}) # type: ignore
        await db.query("MATCH (p:Project {id: $pid}) DETACH DELETE p", {"pid": project_id}) # type: ignore
        logger.info(f"Deleted project: {project_id}")
        return {"status": "success", "deleted": project_id}
    except Exception as e:
        logger.error(f"Failed to delete project {project_id}: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/suggest")
async def suggest_and_save(
    request: SuggestRequest,
    current_user: dict = Depends(get_current_user)
):
    p_id = request.project_id or str(uuid.uuid4())
    ck = request.concept.lower().strip()
    ancestors = request.ancestors or []
    user_id = current_user["user_id"]
    now = datetime.now().isoformat()

    if ck in _suggestion_cache:
        logger.info(f"Cache hit: '{ck}'")
        cached = _suggestion_cache[ck]
        # FIXED: atomic project creation + ownership in one query # type: ignore
        await link_project_to_user(
            user_id, p_id,
            f"Exploration: {request.concept}", now
        ) # type: ignore
        await db.query(
            "MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev",
            {"pname": request.concept, "ev": json.dumps(cached["evidences"])}
        )
        if not request.project_id:
            await db.query("""
                MATCH (p:Project {id: $pid})
                MERGE (c:Concept {name: $cname})
                MERGE (p)-[:HAS_ROOT]->(c)
            """, {"pid": p_id, "cname": request.concept})
        return {
            "project_id": p_id, "parent": request.concept,
            "suggestions": cached["suggestions"],
            "evidence_pointers": cached["evidences"], "cached": True
        }

    graph_context, bioportal_context, trials = await asyncio.gather(
        get_graph_context(
            request.concept, p_id if request.project_id else None, user_id),
        get_bioportal_context(request.concept),
        fetch_clinical_trials(request.concept, 3)
    )
    ct_evidence = build_clinical_trials_evidence(trials)

    enriched_query = build_enriched_pubmed_query(
        request.concept, bioportal_context, graph_context, ancestors
    )
    docs = await asyncio.to_thread(fetch_pubmed_abstracts, enriched_query, 3)
    if not docs:
        docs = await asyncio.to_thread(fetch_pubmed_abstracts, request.concept, 3)

    evidences = build_evidences(docs)
    context_str = build_context_str(docs)
    ancestor_chain = " → ".join(ancestors + [request.concept]) if ancestors else request.concept
    bp_evidence = build_bioportal_evidence(bioportal_context, request.concept)

    synonyms = bioportal_context.get("synonyms", [])
    semantic_type = bioportal_context.get("semantic_type", "")
    parents = bioportal_context.get("parents", [])
    ontology_parts = []
    if synonyms:
        ontology_parts.append(f"Synonyms: {', '.join(synonyms)}")
    if semantic_type:
        ontology_parts.append(f"Type: {semantic_type}")
    if parents:
        ontology_parts.append(f"Broader: {', '.join(parents)}")
    ontology_context = " | ".join(ontology_parts) if ontology_parts else "Not available"

    all_existing = list(set(
        graph_context["existing_nodes"] + graph_context["siblings"] +
        graph_context["related_explored"] + ancestors
    ))

    available_pmids = ", ".join(str(d["pubid"]) for d in docs) if docs else "none"
    first_pmid = docs[0]["pubid"] if docs else "none"

    prompt = f"""You are a medical expert expanding a clinical knowledge map.
Concept: '{request.concept}'
Clinical hierarchy: {ancestor_chain}
Map depth: {graph_context['depth']}
Ontology context (BioPortal): {ontology_context}
PubMed evidence (ONLY use these PMIDs: {available_pmids}):
{context_str}
Already mapped — DO NOT suggest: {', '.join(all_existing[:15]) if all_existing else 'None'}
Suggest 5 NEW, SPECIFIC, REAL medical subtopics for '{request.concept}'.
- Write actual medical terms, NOT placeholders
- Every term must have evidence_pubid from: {available_pmids}
Return ONLY valid JSON with 5 real medical terms:
{{"subtopics":[{{"term":"FILL_WITH_REAL_TERM","evidence_pubid":"{first_pmid}"}}]}}"""

    suggestions_data = []
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL, "prompt": prompt,
                    "format": "json", "stream": False,
                    "options": {"num_predict": 300, "temperature": 0.2}
                }
            )
            parsed = json.loads(res.json().get("response", "{}"))
            suggestions_data = build_suggestions(
                parsed.get("subtopics", []), docs,
                existing=all_existing,
                bioportal_evidence=bp_evidence,
                ct_evidence=ct_evidence
            )
        except Exception as e:
            logger.error(f"LLM failed: {type(e).__name__}: {e}")

    if not suggestions_data:
        suggestions_data = await generate_llm_fallback( # Add await here
            request.concept, ancestors, docs, bp_evidence, ct_evidence
        )

    if suggestions_data:
        _suggestion_cache[ck] = {
            "suggestions": suggestions_data, "evidences": evidences,
            "ontology_evidence": bp_evidence # type: ignore
        }
        save_cache(_suggestion_cache)

    # FIXED: atomic project creation + ownership
    await link_project_to_user(
        user_id, p_id,
        f"Exploration: {request.concept}", now
    )
    await db.query(
        "MERGE (parent:Concept {name: $pname}) SET parent.evidence = $ev",
        {"pname": request.concept, "ev": json.dumps(evidences)}
    )
    if not request.project_id:
        await db.query("""
            MATCH (p:Project {id: $pid})
            MERGE (c:Concept {name: $cname})
            MERGE (p)-[:HAS_ROOT]->(c)
        """, {"pid": p_id, "cname": request.concept})

    return {
        "project_id": p_id, "parent": request.concept,
        "suggestions": suggestions_data, "evidence_pointers": evidences,
        "ontology_evidence": bp_evidence
    }


@app.post("/suggest-staged")
async def suggest_staged(
    request: StagedSuggestRequest,
    current_user: dict = Depends(get_current_user)
):
    p_id = request.project_id or str(uuid.uuid4())
    ck = f"staged_{request.stage}_{request.concept.lower().strip()}"
    user_id = current_user["user_id"]
    now = datetime.now().isoformat()

    if ck in _suggestion_cache:
        logger.info(f"Cache hit (staged): '{ck}'")
        cached = _suggestion_cache[ck]
        # FIXED: atomic project creation + ownership # type: ignore
        await link_project_to_user(user_id, p_id, f"Clinical: {request.symptom}", now)
        await db.query(
            "MERGE (parent:Concept {name: $pname}) "
            "SET parent.evidence = $ev, parent.stage = $stage",
            {"pname": request.concept, "ev": json.dumps(cached["evidences"]),
             "stage": request.stage}
        )
        if not request.project_id:
            await db.query("""
                MATCH (p:Project {id: $pid})
                MERGE (c:Concept {name: $cname})
                MERGE (p)-[:HAS_ROOT]->(c)
            """, {"pid": p_id, "cname": request.concept})
        return {
            "project_id": p_id, "parent": request.concept,
            "stage": request.stage, "suggestions": cached["suggestions"],
            "evidence_pointers": cached["evidences"], "cached": True
        }

    graph_context, bioportal_context, trials = await asyncio.gather(
        get_graph_context(
            request.concept, p_id if request.project_id else None, user_id),
        get_bioportal_context(request.concept),
        fetch_clinical_trials(request.concept, 3)
    )
    ct_evidence = build_clinical_trials_evidence(trials)
    bp_evidence = build_bioportal_evidence(bioportal_context, request.concept)
    synonyms = bioportal_context.get("synonyms", [])
    synonym_str = " OR ".join(f'"{s}"' for s in synonyms[:2]) if synonyms else ""

    stage_base_queries = {
        "differential": f"{request.symptom} differential diagnosis etiology",
        "mechanism":    f"{request.concept} pathophysiology mechanism",
        "workup":       f"{request.concept} diagnostic workup laboratory imaging",
        "treatment":    f"{request.concept} treatment management therapy",
        "monitoring":   f"{request.concept} monitoring prognosis complications"
    }
    base_query = stage_base_queries.get(
        request.stage, f"{request.symptom} {request.concept}"
    )
    search_query = f"({base_query}) OR ({synonym_str})" if synonym_str else base_query

    docs = await asyncio.to_thread(fetch_pubmed_abstracts, search_query, 3)
    if not docs:
        docs = await asyncio.to_thread(
            fetch_pubmed_abstracts, f"{request.symptom} {request.concept}", 3
        )

    evidences = build_evidences(docs)
    context_str = build_context_str(docs)
    available_pmids = ", ".join(str(d["pubid"]) for d in docs) if docs else "none"

    ontology_parts = []
    if synonyms:
        ontology_parts.append(f"Synonyms: {', '.join(synonyms[:3])}")
    semantic_type = bioportal_context.get("semantic_type", "")
    if semantic_type:
        ontology_parts.append(f"Type: {semantic_type}")
    ontology_context = " | ".join(ontology_parts) if ontology_parts else "Not available"

    prompt_template = STAGE_PROMPTS.get(request.stage, STAGE_PROMPTS["differential"])
    prompt = prompt_template.format(
        symptom=request.symptom, concept=request.concept,
        context=context_str, ontology_context=ontology_context,
        graph_summary=graph_context["graph_summary"] or "No prior context"
    )
    prompt += f"\n\nAvailable PMIDs: {available_pmids}"

    all_existing = list(set(
        graph_context["existing_nodes"] + graph_context["siblings"] +
        graph_context["related_explored"]
    ))

    suggestions_data = []
    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": OLLAMA_MODEL, "prompt": prompt,
                    "format": "json", "stream": False,
                    "options": {"num_predict": 300, "temperature": 0.2}
                }
            )
            raw = res.json().get("response", "{}")
            logger.info(f"Staged LLM raw: {raw[:200]}")
            parsed = json.loads(raw)
            suggestions_data = build_suggestions(
                parsed.get("subtopics", []), docs,
                stage=request.stage, existing=all_existing,
                bioportal_evidence=bp_evidence, ct_evidence=ct_evidence
            )
        except Exception as e:
            logger.error(f"Staged LLM failed: {type(e).__name__}: {e}")

    if not suggestions_data:
        suggestions_data = await generate_llm_fallback( # Add await here
            request.concept, [request.symptom], docs, bp_evidence, ct_evidence
        )

    if suggestions_data:
        _suggestion_cache[ck] = {
            "suggestions": suggestions_data, "evidences": evidences,
            "ontology_evidence": bp_evidence
        }
        save_cache(_suggestion_cache)

    # FIXED: atomic project creation + ownership
    await link_project_to_user(user_id, p_id, f"Clinical: {request.symptom}", now)
    await db.query(
        "MERGE (parent:Concept {name: $pname}) "
        "SET parent.evidence = $ev, parent.stage = $stage",
        {"pname": request.concept, "ev": json.dumps(evidences),
         "stage": request.stage}
    )
    if not request.project_id:
        await db.query("""
            MATCH (p:Project {id: $pid})
            MERGE (c:Concept {name: $cname})
            MERGE (p)-[:HAS_ROOT]->(c)
        """, {"pid": p_id, "cname": request.concept})

    return {
        "project_id": p_id, "parent": request.concept,
        "stage": request.stage, "suggestions": suggestions_data,
        "evidence_pointers": evidences, "ontology_evidence": bp_evidence
    }


@app.post("/accept-suggestion")
async def accept_suggestion(
    request: AcceptSuggestionRequest,
    current_user: dict = Depends(get_current_user)
):
    await db.query("""
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
async def list_projects(current_user: dict = Depends(get_current_user)):
    results = await db.query(
        "MATCH (u:User {id: $uid})-[:OWNS]->(p:Project) "
        "RETURN p.id as id, p.title as title ORDER BY p.created_at DESC",
        {"uid": current_user["user_id"]}
    )
    return [dict(r) for r in results]


@app.post("/saved-articles")
async def save_article(
    request: SaveArticleRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        # FIXED: single atomic query — MERGE article then link to user
        await db.query("""
            MATCH (u:User {id: $uid})
            MERGE (a:SavedArticle {pubid: $pubid})
            ON CREATE SET a.title = $title, a.saved_at = $date, a.owner_id = $uid
            ON MATCH SET a.title = $title
            MERGE (u)-[:SAVED]->(a)
        """, {
            "uid": current_user["user_id"],
            "pubid": request.pubid,
            "title": request.title,
            "date": datetime.now().isoformat()
        })
        return {"status": "success", "pubid": request.pubid}
    except Exception as e:
        logger.error(f"Save article failed: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/saved-articles")
async def get_saved_articles(current_user: dict = Depends(get_current_user)):
    results = await db.query(
        "MATCH (u:User {id: $uid})-[:SAVED]->(a:SavedArticle) "
        "RETURN a.pubid as pubid, a.title as title, a.saved_at as saved_at "
        "ORDER BY a.saved_at DESC",
        {"uid": current_user["user_id"]}
    )
    return [dict(r) for r in results]


@app.delete("/saved-articles/{pubid}")
async def delete_saved_article(
    pubid: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        await db.query(
            "MATCH (u:User {id: $uid})-[:SAVED]->(a:SavedArticle {pubid: $pubid}) "
            "DETACH DELETE a",
            {"uid": current_user["user_id"], "pubid": pubid}
        )
        return {"status": "success", "deleted": pubid}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/clinical-trials/{concept}")
async def get_clinical_trials(
    concept: str,
    current_user: dict = Depends(get_current_user)
):
    trials = await fetch_clinical_trials(concept, max_results=10)
    return {"concept": concept, "trials": trials, "count": len(trials)}


@app.post("/fetch-full-evidence")
async def fetch_full_evidence(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    pubid = request.get("pubid")
    if not pubid:
        return {"error": "pubid required"}
    try:
        handle = Entrez.efetch(
            db="pubmed", id=pubid, rettype="abstract", retmode="text"
        )
        return {"full_content": handle.read()}
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)