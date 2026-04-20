import React, { useState, useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import axios from 'axios';

// Enregistrement du layout
cytoscape.use(coseBilkent);

const App = () => {
  const [concept, setConcept] = useState('');
  const [elements, setElements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const style: cytoscape.Stylesheet[] = [
    {
      selector: 'node',
      style: {
        'background-color': '#3b82f6',
        'label': 'data(label)',
        'color': '#fff',
        'text-valign': 'center',
        'text-halign': 'center',
        'width': 120,
        'height': 50,
        'shape': 'round-rectangle',
        'font-size': '12px'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    }
  ];

  const handleGenerate = async () => {
    if (!concept || isLoading) return;

    setIsLoading(true);
    try {
      // 1. Appel au backend FastAPI
      const response = await axios.post(
        'http://localhost:8000/suggest', 
        { concept },
        { timeout: 60000 } // Attendre 1 minute (60000ms)
      );
      
      const suggestions = response.data.suggestions || [];
      console.log("Suggestions reçues:", suggestions);

      if (suggestions.length === 0) {
        alert("L'IA n'a pas pu générer de suggestions pour ce concept.");
        return;
      }

      // 2. Création du nœud parent et des nœuds enfants
      const parentId = `node-${Math.random().toString(36).substring(7)}`;
      
      const centerNode = { data: { id: parentId, label: concept } };
      const childNodes = suggestions.map((s: string, index: number) => ({
        data: { 
          id: `child-${parentId}-${index}`, 
          label: s 
        }
      }));

      const newEdges = childNodes.map((node: any) => ({
        data: { 
          id: `edge-${parentId}-${node.data.id}`,
          source: parentId, 
          target: node.data.id 
        }
      }));

      const newElements = [centerNode, ...childNodes, ...newEdges];
      console.log("Ajout au canvas:", newElements);

      // 3. Mise à jour de l'état : on remplace les anciens éléments
      setElements(newElements);

    } catch (error) {
      console.error("Erreur lors de la génération:", error);
      alert("Erreur de génération. Vérifiez la console (F12).");
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Effet pour gérer le layout et le redimensionnement automatiquement
  useEffect(() => {
    if (cyRef.current && elements.length > 0) {
      cyRef.current.resize();
      cyRef.current.layout({ 
        name: 'cose-bilkent', 
        animate: true, 
        fit: true, 
        padding: 50 
      }).run();
    }
  }, [elements]);

  return (
    <div className="relative w-screen h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Header / Input Panel */}
      <div className="relative z-[100] p-4 bg-white shadow-md flex gap-2 shrink-0">
        <input
          type="text"
          className="border p-2 rounded w-64 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Entrez un concept (ex: Photosynthèse)"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
        />
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className={`${
            isLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          } text-white px-4 py-2 rounded transition`}
        >
          {isLoading ? 'Génération...' : 'Générer'}
        </button>
      </div>

      {/* Canvas */}
         <div className="flex-grow relative z-0 border-t border-slate-200 bg-white" style={{ minHeight: 500 }}>
           <CytoscapeComponent
             elements={elements}
             style={{ width: '100%', height: '500px' }}
             stylesheet={style}
             cy={(cy) => { cyRef.current = cy; }}
           />
         </div>
    </div>
  );
};

export default App;