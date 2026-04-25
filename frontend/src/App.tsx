import React, { useState, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import axios from 'axios';
import { BookOpen, Loader2, ChevronRight, Activity, X, PlusCircle } from 'lucide-react';
import cytoscape from 'cytoscape';

const API_BASE = "http://localhost:8000";

interface Evidence {
  title: string;
  pubid: string;
  url: string;
  preview: string;
}

interface SelectedNode {
  id: string;
  label: string;
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

  const layout = { 
    name: 'cose', // 'cose' est meilleur pour les cartes qui grandissent dynamiquement
    animate: true,
    padding: 50,
    componentSpacing: 100
  };
  
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
        'curve-style': 'bezier'
      }
    },
    {
      selector: ':selected',
      style: {
        'background-color': '#1e40af',
        'border-width': 3,
        'border-color': '#93c5fd'
      }
    }
  ];

  // LOGIQUE CRUCIALE : Ajout dynamique au lieu de remplacement
  const generateBranch = async (topic: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest`, { concept: topic });
      
      const parentId = topic.toLowerCase();
      
      // On vérifie si le nœud parent existe déjà, sinon on le crée
      const existingIds = elements.map(el => el.data.id);
      const newElements = [];

      if (!existingIds.includes(parentId)) {
        newElements.push({ data: { id: parentId, label: topic.toUpperCase() } });
      }
      
      res.data.suggestions.forEach((s: string) => {
        const childId = s.toLowerCase();
        // Eviter les doublons de nœuds
        if (!existingIds.includes(childId)) {
          newElements.push({ 
            data: { 
              id: childId, 
              label: s, 
              evidence: res.data.evidence_pointers 
            } 
          });
        }
        // Créer le lien
        newElements.push({ data: { source: parentId, target: childId } });
      });

      // Fusionner avec les éléments existants
      setElements(prev => [...prev, ...newElements]);
      
      // Relancer le layout pour réorganiser la carte
      setTimeout(() => {
        if (cyRef.current) {
          cyRef.current.layout(layout).run();
        }
      }, 100);

    } catch (err) {
      console.error("Erreur génération:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFullEvidence = async (pubid: string) => {
    setFetchingFull(true);
    try {
      const res = await axios.post(`${API_BASE}/fetch-full-evidence`, { pubid });
      setFullArticle(res.data.full_content);
    } catch (err) {
      setFullArticle("Erreur de récupération.");
    } finally {
      setFetchingFull(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      
      {/* SIDEBAR */}
      <div className="w-80 bg-white border-r border-slate-200 p-6 flex flex-col shadow-sm z-20">
        <div className="flex items-center gap-2 mb-8 text-blue-600">
          <Activity size={24} />
          <h1 className="font-bold text-xl tracking-tight">MedMind Explorer</h1>
        </div>
        
        <div className="space-y-4 mb-8">
          <input 
            className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Concept racine..."
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          />
          <button 
            onClick={() => { setElements([]); generateBranch(concept); }}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Nouvelle Recherche"}
          </button>
        </div>

        {selectedNode && (
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <h2 className="text-sm font-bold text-blue-800 mb-2">{selectedNode.label}</h2>
              <button 
                onClick={() => generateBranch(selectedNode.label)}
                className="w-full bg-blue-600 text-white py-2 rounded flex items-center justify-center gap-2 text-xs font-bold hover:bg-blue-700"
              >
                <PlusCircle size={14} /> Explorer ce sujet
              </button>
            </div>

            {selectedNode.evidence && (
              <>
                <h3 className="font-bold text-xs text-slate-400 uppercase mb-4 flex items-center gap-2">
                  <BookOpen size={14} /> Sources RAG
                </h3>
                {selectedNode.evidence.map((ev, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-3 text-[11px]">
                    <p className="font-bold text-blue-900 mb-1">{ev.title}</p>
                    <button onClick={() => fetchFullEvidence(ev.pubid)} className="text-blue-600 hover:underline">
                      Détails de l'Agent
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* CANVAS */}
      <div className="flex-1 bg-white relative">
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: '100%' }}
          layout={layout}
          stylesheet={style}
          cy={(cy: cytoscape.Core) => {
            cyRef.current = cy;
            cy.on('tap', 'node', (evt) => {
              const node = evt.target;
              setSelectedNode({ 
                id: node.id(), 
                label: node.data('label'),
                evidence: node.data('evidence') 
              });
            });
          }}
        />
      </div>

      {/* AGENT DYNAMIQUE */}
      {(fullArticle || fetchingFull) && (
        <div className="w-[400px] bg-white border-l border-slate-200 p-6 overflow-y-auto shadow-2xl z-30">
          <div className="flex justify-between mb-6 italic text-blue-600 text-sm">
            <span>Agent de Recherche PubMed</span>
            <button onClick={() => setFullArticle("")}><X size={18} /></button>
          </div>
          {fetchingFull ? <Loader2 className="animate-spin mx-auto mt-20" /> : 
            <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans text-slate-700">
              {fullArticle}
            </pre>
          }
        </div>
      )}
    </div>
  );
};

export default App;