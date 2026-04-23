import React, { useState, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import axios from 'axios';
import { BookOpen, Loader2, ChevronRight, Activity, X } from 'lucide-react';
import cytoscape from 'cytoscape';

const API_BASE = "http://localhost:8000";

// --- TYPES TYPESCRIPT ---
interface Evidence {
  title: string;
  pubid: string;
  url: string;
  preview: string;
}

interface SelectedNode {
  id: string;
  evidence: Evidence[];
}

const App: React.FC = () => {
  const [concept, setConcept] = useState<string>("");
  const [elements, setElements] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [fullArticle, setFullArticle] = useState<string>("");
  const [fetchingFull, setFetchingFull] = useState<boolean>(false);

  const cyRef = useRef<cytoscape.Core | null>(null);

  // Configuration du layout de la carte
  const layout = { 
    name: 'breadthfirst', 
    directed: true, 
    padding: 30,
    spacingFactor: 1.2 
  };
  
  // Style visuel de la carte
  const style: any[] = [
    {
      selector: 'node',
      style: {
        'background-color': '#2563eb',
        'label': 'data(label)',
        'color': '#fff',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        'width': '120px',
        'height': '40px',
        'shape': 'round-rectangle',
        'font-weight': 'bold',
        'text-wrap': 'wrap',
        'text-max-width': '100px'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#cbd5e1',
        'target-arrow-color': '#cbd5e1',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'arrow-scale': 1.2
      }
    },
    {
      selector: ':selected',
      style: {
        'background-color': '#1e40af',
        'line-color': '#1e40af',
        'target-arrow-color': '#1e40af',
        'border-width': 3,
        'border-color': '#93c5fd'
      }
    }
  ];

  // Fonction pour générer les nouveaux nœuds via le RAG
  const handleGenerate = async () => {
    if (!concept) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest`, { concept });
      
      const rootId = concept.toLowerCase();
      const rootNode = { data: { id: rootId, label: concept.toUpperCase() } };
      
      const newNodes = res.data.suggestions.map((s: string) => ({
        data: { 
          id: s.toLowerCase(), 
          label: s, 
          evidence: res.data.evidence_pointers 
        }
      }));
      
      const newEdges = res.data.suggestions.map((s: string) => ({
        data: { source: rootId, target: s.toLowerCase() }
      }));

      setElements([rootNode, ...newNodes, ...newEdges]);
    } catch (err) {
      console.error("Erreur lors de la génération des suggestions:", err);
    } finally {
      setLoading(false);
    }
  };

  // Agent de Récupération Dynamique : Fetch PubMed en temps réel
  const fetchFullEvidence = async (pubid: string) => {
    setFetchingFull(true);
    setFullArticle("");
    try {
      const res = await axios.post(`${API_BASE}/fetch-full-evidence`, { pubid });
      setFullArticle(res.data.full_content);
    } catch (err) {
      setFullArticle("Erreur : Impossible de récupérer l'article complet depuis PubMed.");
    } finally {
      setFetchingFull(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* --- SIDEBAR GAUCHE : CONTRÔLE ET SOURCES --- */}
      <div className="w-80 bg-white border-r border-slate-200 p-6 flex flex-col shadow-sm z-20">
        <div className="flex items-center gap-2 mb-8 text-blue-600">
          <Activity size={24} />
          <h1 className="font-bold text-xl tracking-tight">MedMind RAG</h1>
        </div>
        
        <div className="space-y-4 mb-8">
          <label className="text-xs font-bold text-slate-400 uppercase">Explorer un concept</label>
          <input 
            className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            placeholder="Ex: Hypertension, Myocarditis..."
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button 
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "Générer la carte"}
          </button>
        </div>

        {/* Panneau des preuves RAG (s'affiche au clic sur un nœud) */}
        {selectedNode?.evidence && (
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <h3 className="font-bold text-sm text-slate-500 uppercase mb-4 flex items-center gap-2">
              <BookOpen size={16} /> Sources PubMed (Abstracts)
            </h3>
            {selectedNode.evidence.map((ev, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100 mb-4 hover:border-blue-200 transition-colors">
                <p className="font-bold text-xs text-blue-800 mb-2 leading-tight">{ev.title}</p>
                <p className="text-[11px] text-slate-600 line-clamp-3 mb-3 italic">"{ev.preview}"</p>
                <button 
                  onClick={() => fetchFullEvidence(ev.pubid)}
                  className="w-full py-2 bg-white border border-blue-100 text-blue-600 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 hover:bg-blue-50 transition-colors uppercase tracking-wider"
                >
                  <ChevronRight size={12} /> Agent Dynamique (Full Text)
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- ZONE CENTRALE : CARTE MENTALE INTERACTIVE --- */}
      <div className="flex-1 bg-white relative">
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: '100%' }}
          layout={layout}
          stylesheet={style}
          cy={(cy: cytoscape.Core) => {
            cyRef.current = cy;
            cy.on('tap', 'node', (evt: any) => {
              const node = evt.target;
              setSelectedNode({ 
                id: node.id(), 
                evidence: node.data('evidence') 
              });
            });
          }}
        />
        {elements.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300 pointer-events-none">
            <p className="text-lg">Entrez un concept pour commencer l'exploration</p>
          </div>
        )}
      </div>

      {/* --- PANNEAU DROIT : AGENT DE RÉCUPÉRATION LIVE --- */}
      {(fullArticle || fetchingFull) && (
        <div className="w-[450px] bg-white border-l border-slate-200 p-8 overflow-y-auto shadow-2xl z-30 animate-in slide-in-from-right duration-300">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <h2 className="font-bold text-blue-600 uppercase tracking-widest text-sm">Récupération Live NCBI</h2>
            </div>
            <button 
              onClick={() => setFullArticle("")} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={20} className="text-slate-400" />
            </button>
          </div>

          {fetchingFull ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p className="text-sm font-medium">Interrogation des serveurs PubMed...</p>
              <p className="text-xs mt-2">Extraction du texte intégral en cours</p>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                <p className="text-blue-700 text-[11px] font-medium leading-relaxed">
                  NOTE : Ce contenu est récupéré dynamiquement depuis la base de données officielle. 
                  Il ne consomme aucun espace de stockage local permanent.
                </p>
              </div>
              <div className="prose prose-slate">
                <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700 font-mono bg-slate-50 p-6 rounded-xl border border-slate-100">
                  {fullArticle}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;