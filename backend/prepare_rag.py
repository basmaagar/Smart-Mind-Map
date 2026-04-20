from datasets import load_dataset
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
import pickle
from pathlib import Path

# --- CONFIGURATION ---
DATASET_NAME = "keivalya/MedQuad-MedicalQnADataset"
INDEX_FILE = "med_knowledge.index"
TEXTS_FILE = "med_texts.pkl"

print("--- Démarrage de l'ingestion ---")

# 1. Chargement des données
texts = []
try:
    print(f"Tentative de chargement du dataset : {DATASET_NAME}...")
    # On charge le dataset depuis le Hub (très stable)
    dataset = load_dataset(DATASET_NAME, split='train')
    
    # On limite à 1000 ou 2000 pour le prototype
    sample_size = min(1500, len(dataset))
    
    # Adaptation au format MedQuad (Question + Réponse)
    for i in range(sample_size):
        item = dataset[i]
        # On crée un texte riche pour que l'embedding soit précis
        combined_text = f"Sujet: {item['Question']} | Détails: {item['Answer'][:400]}"
        texts.append(combined_text)
        
    print(f"Succès : {len(texts)} documents chargés depuis le Hub.")

except Exception as e:
    print(f"Erreur lors du chargement: {e}")
    print("Utilisation des données de secours (Fallback)...")
    texts = [
        "Sujet: Cardiologie | Détails: Symptômes d'arythmie, palpitations et essoufflement.",
        "Sujet: Neurologie | Détails: Migraines chroniques avec aura et sensibilité à la lumière.",
        "Sujet: Orthopédie | Détails: Douleurs lombaires aiguës après effort physique.",
        "Sujet: Diabète | Détails: Gestion de l'insuline et surveillance de la glycémie à jeun.",
        "Sujet: Dermatologie | Détails: Eczéma atopique et traitements par dermocorticoïdes."
    ]

# 2. Modèle d'embedding (Standard de l'industrie pour le local)
print("Chargement du modèle d'embedding (MiniLM-L6)...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# 3. Vectorisation
print(f"Vectorisation en cours (pour {len(texts)} textes)...")
embeddings = model.encode(texts, show_progress_bar=True)

# 4. Création de l'index FAISS
print("Création de l'index FAISS...")
dimension = embeddings.shape[1]
index = faiss.IndexFlatL2(dimension)
index.add(np.array(embeddings).astype('float32'))

# 5. Sauvegarde locale
print(f"Sauvegarde vers {INDEX_FILE} et {TEXTS_FILE}...")
faiss.write_index(index, INDEX_FILE)
with open(TEXTS_FILE, "wb") as f:
    pickle.dump(texts, f)

print("--- Succès ! Socle RAG prêt. ---")