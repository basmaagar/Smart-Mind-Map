import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';

interface MindMapProps {
  elements: any[];
  onNodeClick: (evidence: any[]) => void;
  onNodeDoubleClick: (label: string) => void;
}

const MindMap: React.FC<MindMapProps> = ({ elements, onNodeClick, onNodeDoubleClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !elements || elements.length === 0) return;

    console.log('Elements received:', elements);
    console.log('Nodes:', elements.filter(el => el.group === 'nodes' || !el.data.source));
    console.log('Edges:', elements.filter(el => el.group === 'edges' || el.data.source));

    // Initialisation de Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#3b82f6', // Bleu vif
            'label': 'data(label)',
            'color': '#ffffff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'width': '180px',
            'height': '60px',
            'shape': 'round-rectangle',
            'text-wrap': 'wrap',
            'text-max-width': '160px',
            'border-width': 2,
            'border-color': '#1d4ed8'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 8,                    // Increased width for visibility
            'line-color': '#ff0000',       // Changed to red for testing visibility
            'target-arrow-color': '#ff0000',
            'target-arrow-shape': 'triangle',
            'curve-style': 'straight',
            'line-opacity': 1,
            'arrow-scale': 1.5,
            'target-distance-from-node': 5,
            'z-index': 10
          }
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#10b981', // Vert quand sélectionné
            'border-color': '#059669'
          }
        }
      ],
      layout: {
        name: 'cose',             // Algorithme de répulsion (force-directed)
        animate: true,
        animationDuration: 800,
        nodeRepulsion: () => 1000000, // Force de répulsion énorme pour éviter l'empilement
        idealEdgeLength: () => 150,   // Distance entre les nœuds
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 50
      },
      wheelSensitivity: 0.2
    });

    // Gestion des clics
    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data();
      // On passe l'evidence à la Sidebar
      onNodeClick(nodeData.evidence || []);
    });

    // Gestion du double-clic (Expansion)
    cy.on('dbltap', 'node', (evt) => {
      const nodeData = evt.target.data();
      onNodeDoubleClick(nodeData.label);
    });

    // Ajustement automatique lors du redimensionnement
    const handleResize = () => {
      cy.resize();
      cy.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cy.destroy();
    };
  }, [elements, onNodeClick, onNodeDoubleClick]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black"
      style={{ minHeight: '100%', cursor: 'grab' }}
    />
  );
};

export default MindMap;