import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';

interface MindMapProps {
  elements: any[];
  onNodeClick: (nodeData: any) => void;
  onNodeDoubleClick: (label: string) => void;
  onAcceptSuggestion?: (suggestionObj: any) => void;
  onDismissSuggestion?: (suggestionObj: any) => void;
  onExploreNode?: (label: string) => void;
}

interface ActiveMenu {
  id: string;
  label: string;
  isSuggestion: boolean;
  x: number;
  y: number;
  renderedHeight: number;
  suggestionObj?: any;
  nodeData: any;
}

const MindMap: React.FC<MindMapProps> = ({ 
  elements, 
  onNodeClick, 
  onNodeDoubleClick,
  onAcceptSuggestion,
  onDismissSuggestion,
  onExploreNode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cyInstance, setCyInstance] = useState<cytoscape.Core | null>(null);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu | null>(null);

  // Keep references to the latest callbacks to avoid stale closures in Cytoscape events
  const callbacksRef = useRef({ onNodeClick, onNodeDoubleClick });
  useEffect(() => {
    callbacksRef.current = { onNodeClick, onNodeDoubleClick };
  }, [onNodeClick, onNodeDoubleClick]);

  // 1. Initialize Cytoscape ONCE
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#3b82f6',
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
            'width': 8,
            'line-color': '#ff0000',
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
            'background-color': '#10b981',
            'border-color': '#059669'
          }
        },
        {
          selector: '.suggestion',
          style: {
            'background-color': '#374151',
            'border-color': '#9ca3af',
            'border-style': 'dashed',
            'color': '#d1d5db',
            'border-width': 2
          }
        },
        {
          selector: '.suggestion-edge',
          style: {
            'line-color': '#6b7280',
            'target-arrow-color': '#6b7280',
            'line-style': 'dashed',
            'width': 4
          }
        }
      ],
      wheelSensitivity: 0.2
    });

    // Event Bindings
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setActiveMenu(null);
      }
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();
      const pos = node.renderedPosition();
      const h = node.renderedHeight();
      
      setActiveMenu({
        id: nodeData.id,
        label: nodeData.label,
        isSuggestion: !!nodeData.isSuggestion,
        x: pos.x,
        y: pos.y,
        renderedHeight: h,
        suggestionObj: nodeData.suggestionObj,
        nodeData: nodeData
      });

      // We still keep the auto-open on click for convenience
      callbacksRef.current.onNodeClick(nodeData);
    });

    const updateMenuPos = () => {
      setActiveMenu(prev => {
        if (!prev) return null;
        if (cy.destroyed()) return prev;
        const node = cy.getElementById(prev.id);
        if (node.length === 0) return null;
        const pos = node.renderedPosition();
        const h = node.renderedHeight();
        return { ...prev, x: pos.x, y: pos.y, renderedHeight: h };
      });
    };

    cy.on('pan zoom', updateMenuPos);
    cy.on('position', 'node', updateMenuPos);

    cy.on('dbltap', 'node', (evt) => {
      const nodeData = evt.target.data();
      if (!nodeData.isSuggestion) {
        callbacksRef.current.onNodeDoubleClick(nodeData.label);
      }
    });

    const handleResize = () => {
      cy.resize();
      // updateMenuPos(); // will be called by observer
    };

    const resizeObserver = new ResizeObserver(() => {
      cy.resize();
      updateMenuPos();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);

    setCyInstance(cy);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      cy.destroy();
    };
  }, []); // Empty dependency array = run once

  // 2. Update elements incrementally
  useEffect(() => {
    if (!cyInstance || !elements || elements.length === 0) return;

    // Save old positions to avoid layout jumping
    const oldPositions = new Map();
    cyInstance.nodes().forEach(n => {
      oldPositions.set(n.id(), { ...n.position() });
    });

    cyInstance.elements().remove();
    cyInstance.add(elements);

    // Restore old positions
    cyInstance.nodes().forEach(n => {
      const oldPos = oldPositions.get(n.id());
      if (oldPos) {
        n.position(oldPos);
      }
    });

    // Run layout incrementally
    cyInstance.layout({
      name: 'cose',
      animate: true,
      animationDuration: 800,
      randomize: false, // Extremely important to stop glitching
      nodeRepulsion: () => 1000000,
      idealEdgeLength: () => 150,
      nodeOverlap: 20,
      refresh: 20,
      fit: true,
      padding: 50
    }).run();

  }, [elements, cyInstance]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full bg-black"
        style={{ minHeight: '100%', cursor: 'grab' }}
      />
      
      {/* Floating Action Menu */}
      {activeMenu && (
        <>
          {/* TOP MENU: Actions */}
          <div 
            className="absolute z-50 transform -translate-x-1/2 -translate-y-full pointer-events-auto"
            style={{ 
              left: activeMenu.x, 
              top: activeMenu.y - (activeMenu.renderedHeight / 2) - 12
            }}
          >
            <div className="bg-gray-900/95 backdrop-blur-lg border border-white/10 rounded-xl shadow-2xl flex items-center gap-2 p-1.5 ring-1 ring-black/50 overflow-hidden whitespace-nowrap">
              {activeMenu.isSuggestion ? (
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => {
                      onAcceptSuggestion?.(activeMenu.suggestionObj);
                      setActiveMenu(null);
                    }}
                    className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-sm flex items-center justify-center"
                    title="Accept Suggestion"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                  </button>
                  <button 
                    onClick={() => {
                      onDismissSuggestion?.(activeMenu.suggestionObj);
                      setActiveMenu(null);
                    }}
                    className="p-2.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm flex items-center justify-center"
                    title="Dismiss Suggestion"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    onExploreNode?.(activeMenu.label);
                    setActiveMenu(null);
                  }}
                  className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all shadow-sm flex items-center gap-2 px-4"
                  title="Explore Subtopics"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  <span className="text-sm font-medium">Explore</span>
                </button>
              )}
            </div>
          </div>

          {/* BOTTOM MENU: Evidence */}
          <div 
            className="absolute z-50 transform -translate-x-1/2 pointer-events-auto"
            style={{ 
              left: activeMenu.x, 
              top: activeMenu.y + (activeMenu.renderedHeight / 2) + 12
            }}
          >
            <div className="bg-gray-900/95 backdrop-blur-lg border border-white/10 rounded-xl shadow-2xl flex items-center gap-2 p-1.5 ring-1 ring-black/50 overflow-hidden whitespace-nowrap">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("Evidence button clicked for node:", activeMenu.label);
                  onNodeClick(activeMenu.nodeData);
                }}
                className="p-2.5 rounded-lg bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white transition-all shadow-sm flex items-center gap-2 px-4"
                title="View Evidence"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <span className="text-sm font-medium">Evidence</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MindMap;