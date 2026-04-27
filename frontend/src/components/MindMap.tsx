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
            'background-color': '#007fff',
            'label': 'data(label)',
            'color': '#ffffff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '10px',
            'font-family': 'JetBrains Mono, monospace',
            'font-weight': 'bold',
            'text-transform': 'uppercase',
            'text-wrap': 'wrap',
            'text-max-width': '120px',
            'line-height': 1.1,
            'width': '140px',
            'height': '45px',
            'shape': 'round-rectangle',
            'corner-radius': '4px',
            'border-width': 0,
            'overlay-opacity': 0,
            'shadow-blur': 15,
            'shadow-color': '#007fff',
            'shadow-opacity': 0.4
          } as any
        },
        {
          selector: 'node[?isRoot]',
          style: {
            'width': '180px',
            'height': '60px',
            'font-size': '12px',
            'background-color': '#00bfff',
            'shadow-blur': 40,
            'shadow-color': '#00bfff',
            'shadow-opacity': 0.8,
            'border-width': 1,
            'border-color': '#ffffff'
          } as any
        },
        {
          selector: 'edge',
          style: {
            'width': 'mapData(depth, 0, 5, 5, 1.5)',
            'line-color': '#444',
            'line-style': 'solid',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#444',
            'arrow-scale': 'mapData(depth, 0, 5, 1.2, 0.8)',
            'opacity': 0.8
          } as any
        },
        {
          selector: 'edge[?isValidated]',
          style: {
            'line-color': '#ffffff',
            'target-arrow-color': '#ffffff',
            'width': 'mapData(depth, 0, 5, 6, 2.5)',
            'shadow-blur': 15,
            'shadow-color': '#ffffff',
            'opacity': 1
          } as any
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 2,
            'border-color': '#ffffff',
            'background-color': '#00bfff',
            'shadow-blur': 30,
            'shadow-opacity': 0.8
          } as any
        },
        {
          selector: '.suggestion',
          style: {
            'background-color': '#050505',
            'border-width': 1,
            'border-color': '#007fff',
            'border-style': 'dashed',
            'color': '#007fff',
            'opacity': 0.8
          } as any
        },
        {
          selector: '.suggestion-edge',
          style: {
            'line-style': 'dashed',
            'opacity': 0.4,
            'line-color': '#444'
          } as any
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
    if (!cyInstance) return;

    if (!elements || elements.length === 0) {
      cyInstance.elements().remove();
      return;
    }

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
      animationDuration: 1000,
      randomize: false,
      nodeRepulsion: () => 8000000, // Significantly increased repulsion
      idealEdgeLength: () => 200,
      nodeOverlap: 40,
      refresh: 20,
      fit: true,
      padding: 100
    }).run();

  }, [elements, cyInstance]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: 'black' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
      />
      
      {/* Floating Action Menu */}
      {activeMenu && (
        <>
          {/* TOP MENU: Actions */}
          <div 
            className="absolute z-50 transform -translate-x-1/2 -translate-y-full pb-6 pointer-events-auto"
            style={{ 
              left: activeMenu.x, 
              top: activeMenu.y - (activeMenu.renderedHeight / 2) - 8
            }}
          >
            <div className="bg-black border border-[#222] flex items-center gap-1 p-1 shadow-[0_0_20px_rgba(0,0,0,1)]">
              {activeMenu.isSuggestion ? (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      onAcceptSuggestion?.(activeMenu.suggestionObj);
                      setActiveMenu(null);
                    }}
                    className="w-10 h-10 bg-green-500 flex items-center justify-center text-black hover:bg-green-400 transition-all shadow-[0_0_15px_rgba(0,255,0,0.4)]"
                    title="Accept"
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                  </button>
                  <button 
                    onClick={() => {
                      onDismissSuggestion?.(activeMenu.suggestionObj);
                      setActiveMenu(null);
                    }}
                    className="w-10 h-10 bg-rose-500 flex items-center justify-center text-white hover:bg-rose-400 transition-all shadow-[0_0_15px_rgba(255,0,0,0.4)]"
                    title="Dismiss"
                  >
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    onExploreNode?.(activeMenu.label);
                    setActiveMenu(null);
                  }}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500 hover:text-white transition-all text-[9px] font-bold uppercase tracking-[0.2em]"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  Init_Expansion
                </button>
              )}
            </div>
          </div>

          {/* BOTTOM MENU: Evidence */}
          <div 
            className="absolute z-50 transform -translate-x-1/2 pointer-events-auto"
            style={{ 
              left: activeMenu.x, 
              top: activeMenu.y + (activeMenu.renderedHeight / 2) + 8
            }}
          >
            <div className="bg-black border border-[#222] p-1">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onNodeClick(activeMenu.nodeData);
                }}
                className="flex items-center gap-2 px-5 py-2 bg-[#050505] text-[#444] border border-[#111] hover:border-blue-500/50 hover:text-blue-500 transition-all text-[9px] font-bold uppercase tracking-[0.2em]"
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Access_Evidence
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MindMap;