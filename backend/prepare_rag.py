import pickle
import faiss
import requests
from datasets import load_dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document

def get_mesh_term(concept: str) -> str:
    """Lookup MeSH preferred term — used to enrich metadata for faster retrieval."""
    try:
        url = f"https://id.nlm.nih.gov/mesh/lookup/label?label={concept}&match=contains&limit=1"
        r = requests.get(url, timeout=3)
        data = r.json()
        return data[0]["label"] if data else concept
    except Exception:
        return concept

def prepare_pointer_rag():
    print("--- Ingestion PubMed (pqa_unlabeled — 211k articles) ---")

    # Use streaming=True to start processing immediately without downloading the whole 211k dataset
    # This prevents the script from appearing "stuck" at the start
    ds = load_dataset("pubmed_qa", "pqa_unlabeled", split="train[:10000]")


    pointer_docs = []
    print("Processing 10,000 documents...")
    for i, item in enumerate(ds):
        if i % 500 == 0 and i > 0:
            print(f"-> Indexed {i} documents...")
        abstract_text = " ".join(item["context"]["contexts"])
        pdf_url = f"https://pubmed.ncbi.nlm.nih.gov/{item['pubid']}/"

        doc = Document(
            page_content=abstract_text,
            metadata={
                "title": item["question"],
                "pdf_link": pdf_url,
                "pubid": item["pubid"],
                # Removed get_mesh_term call to prevent 10,000 sequential network requests
                "mesh_term": "N/A"
            }
        )
        pointer_docs.append(doc)

    print(f"✅ Loaded {len(pointer_docs)} documents.")

    # Switching to a medical-specific model as per architectural requirements
    # This alone meaningfully improves retrieval relevance for medical concepts
    embeddings = HuggingFaceEmbeddings(
        model_name="microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext"
    )

    print("Building FAISS index — this will take a few minutes...")
    vectorstore = FAISS.from_documents(pointer_docs, embeddings)

    faiss.write_index(vectorstore.index, "med_knowledge.index")
    with open("med_texts.pkl", "wb") as f:
        pickle.dump(pointer_docs, f)

    print("✅ Index ready. Run main.py to start the server.")

if __name__ == "__main__":
    prepare_pointer_rag()