import pickle
import faiss
from datasets import load_dataset
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document

def prepare_pointer_rag():
    print("--- Ingestion des Pointers PubMed ---")
    
    # Chargement de PubMedQA (contient les liens et les abstracts)
    ds = load_dataset("pubmed_qa", "pqa_labeled", split='train')
    
    pointer_docs = []
    for item in ds:
        # On indexe l'abstract pour la recherche sémantique
        abstract_text = " ".join(item['context']['contexts'])
        
        # On stocke l'URL du PDF original dans les métadonnées
        # Note: Dans PubMed, l'URL est souvent constructible via le pubid
        pdf_url = f"https://pubmed.ncbi.nlm.nih.gov/{item['pubid']}/"
        
        doc = Document(
            page_content=abstract_text,
            metadata={
                "title": item['question'],
                "pdf_link": pdf_url,
                "pubid": item['pubid']
            }
        )
        pointer_docs.append(doc)

    # Création de l'index (Léger car uniquement des abstracts)
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    vectorstore = FAISS.from_documents(pointer_docs, embeddings)
    
    # Sauvegarde
    faiss.write_index(vectorstore.index, "med_knowledge.index")
    with open("med_texts.pkl", "wb") as f:
        pickle.dump(pointer_docs, f)
    print("✅ Index de pointeurs prêt.")

if __name__ == "__main__":
    prepare_pointer_rag()