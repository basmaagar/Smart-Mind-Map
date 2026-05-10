import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import cytoscape from 'cytoscape';

export type MindMapHandle = {
  getCy: () => cytoscape.Core | null;
}

interface MindMapProps {
  elements: any[];
  onNodeClick: (nodeData: any) => void;
  onNodeDoubleClick: (label: string, ancestors: string[]) => void;
  onAcceptSuggestion?: (suggestionObj: any) => void;
  onDismissSuggestion?: (suggestionObj: any) => void;
  onExploreNode?: (label: string, ancestors: string[]) => void;
  searchTerm?: string;
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
  ancestors: string[];
}

const MindMapInner = forwardRef<MindMapHandle, MindMapProps>(({
  elements,
  onNodeClick,
  onNodeDoubleClick,
  onAcceptSuggestion,
  onDismissSuggestion,
  onExploreNode,
  searchTerm = ''
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cyInstance, setCyInstance] = useState<cytoscape.Core | null>(null);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({
    getCy: () => cyInstance
  }));

  const callbacksRef = useRef({ onNodeClick, onNodeDoubleClick });
  useEffect(() => {
    callbacksRef.current = { onNodeClick, onNodeDoubleClick };
  }, [onNodeClick, onNodeDoubleClick]);

  const getAncestors = (cy: cytoscape.Core, nodeId: string): string[] => {
    const ancestors: string[] = [];
    let currentId = nodeId;
    while (true) {
      const incomingEdges = cy.edges(`[target = "${currentId}"]`);
      if (incomingEdges.length === 0) break;
      const parentId = incomingEdges[0].data('source');
      const parentNode = cy.getElementById(parentId);
      if (!parentNode || parentNode.length === 0) break;
      const parentLabel = parentNode.data('label');
      if (!parentLabel) break;
      ancestors.unshift(parentLabel);
      currentId = parentId;
    }
    return ancestors;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#ffffff',
            'label': 'data(label)',
            'color': '#185FA5',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-family': 'system-ui, sans-serif',
            'font-weight': '500',
            'text-wrap': 'wrap',
            'text-max-width': '100px',
            'line-height': 1.2,
            'width': '130px',
            'height': '48px',
            'shape': 'round-rectangle',
            'border-width': 1.5,
            'border-color': '#B5D4F4',
            'overlay-opacity': 0,
          } as any
        },
        {
          selector: 'node[?isRoot]',
          style: {
            'background-color': '#185FA5',
            'color': '#ffffff',
            'width': '150px',
            'height': '56px',
            'font-size': '13px',
            'border-width': 0,
          } as any
        },
        {
          selector: 'node[category="symptom"]',
          style: {
            'border-color': '#F09595',
            'color': '#A32D2D',
            'background-color': '#FCEBEB',
          } as any
        },
        {
          selector: 'node[category="treatment"]',
          style: {
            'border-color': '#C0DD97',
            'color': '#3B6D11',
            'background-color': '#EAF3DE',
          } as any
        },
        {
          selector: 'node[category="mechanism"]',
          style: {
            'border-color': '#B5D4F4',
            'color': '#185FA5',
            'background-color': '#E6F1FB',
          } as any
        },
        {
          selector: 'node[category="risk"]',
          style: {
            'border-color': '#FAC775',
            'color': '#854F0B',
            'background-color': '#FAEEDA',
          } as any
        },
        {
          selector: 'node[category="diagnosis"]',
          style: {
            'border-color': '#AFA9EC',
            'color': '#3C3489',
            'background-color': '#EEEDFE',
          } as any
        },
        {
          selector: 'node.searched',
          style: {
            'border-color': '#EF9F27',
            'border-width': 2.5,
            'background-color': '#FAEEDA',
            'color': '#633806',
          } as any
        },
        {
          selector: 'node.collapsed-parent',
          style: {
            'border-style': 'double',
            'border-width': 3,
          } as any
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 2.5,
            'border-color': '#185FA5',
          } as any
        },
        {
          selector: '.suggestion',
          style: {
            'background-color': '#f8fafc',
            'border-width': 1.5,
            'border-color': '#B5D4F4',
            'border-style': 'dashed',
            'color': '#378ADD',
            'opacity': 0.9
          } as any
        },
        {
          selector: '.suggestion-edge',
          style: {
            'line-style': 'dashed',
            'opacity': 0.5,
            'line-color': '#B5D4F4'
          } as any
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#B5D4F4',
            'line-style': 'solid',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#B5D4F4',
            'arrow-scale': 0.8,
            'opacity': 0.8
          } as any
        },
        {
          selector: 'edge[?isValidated]',
          style: {
            'line-color': '#1D9E75',
            'target-arrow-color': '#1D9E75',
            'width': 2,
            'opacity': 1
          } as any
        },
        {
          selector: '.hidden',
          style: { 'display': 'none' } as any
        }
      ],
      wheelSensitivity: 0.2
    });

    cy.on('tap', evt => {
      if (evt.target === cy) setActiveMenu(null);
    });

    cy.on('tap', 'node', evt => {
      const node = evt.target;
      const nodeData = node.data();
      const pos = node.renderedPosition();
      const h = node.renderedHeight();
      const ancestors = getAncestors(cy, nodeData.id);
      setActiveMenu({
        id: nodeData.id, label: nodeData.label,
        isSuggestion: !!nodeData.isSuggestion,
        x: pos.x, y: pos.y, renderedHeight: h,
        suggestionObj: nodeData.suggestionObj,
        nodeData, ancestors
      });
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

    cy.on('dbltap', 'node', evt => {
      const nodeData = evt.target.data();
      if (!nodeData.isSuggestion) {
        const ancestors = getAncestors(cy, nodeData.id);
        callbacksRef.current.onNodeDoubleClick(nodeData.label, ancestors);
      }
    });

    const resizeObserver = new ResizeObserver(() => { cy.resize(); updateMenuPos(); });
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', () => cy.resize());

    setCyInstance(cy);

    return () => {
      window.removeEventListener('resize', () => cy.resize());
      resizeObserver.disconnect();
      cy.destroy();
    };
  }, []);

  // Update elements
  useEffect(() => {
    if (!cyInstance) return;
    if (!elements || elements.length === 0) {
      cyInstance.elements().remove();
      return;
    }
    const oldPositions = new Map();
    cyInstance.nodes().forEach(n => oldPositions.set(n.id(), { ...n.position() }));
    cyInstance.elements().remove();
    cyInstance.add(elements);
    cyInstance.nodes().forEach(n => {
      const oldPos = oldPositions.get(n.id());
      if (oldPos) n.position(oldPos);
    });
    cyInstance.layout({
      name: 'cose', animate: true, animationDuration: 1200,
      randomize: false, nodeRepulsion: 4500,
      idealEdgeLength: 100, nodeOverlap: 40,
      refresh: 20, fit: true, padding: 100
    } as any).run();
  }, [elements, cyInstance]);

  // Search highlight
  useEffect(() => {
    if (!cyInstance) return;
    cyInstance.nodes().removeClass('searched');
    if (searchTerm.trim().length > 1) {
      const term = searchTerm.toLowerCase();
      cyInstance.nodes().forEach(node => {
        if (node.data('label')?.toLowerCase().includes(term)) {
          node.addClass('searched');
        }
      });
    }
  }, [searchTerm, cyInstance]);

  // Collapse/expand
  const toggleCollapse = (nodeId: string) => {
    if (!cyInstance) return;
    const node = cyInstance.getElementById(nodeId);
    const children = cyInstance.edges(`[source = "${nodeId}"]`).targets();
    const isCollapsed = collapsedNodes.has(nodeId);
    if (isCollapsed) {
      children.removeClass('hidden');
      cyInstance.edges(`[source = "${nodeId}"]`).removeClass('hidden');
      setCollapsedNodes(prev => { const s = new Set(prev); s.delete(nodeId); return s; });
      node.removeClass('collapsed-parent');
    } else {
      children.addClass('hidden');
      cyInstance.edges(`[source = "${nodeId}"]`).addClass('hidden');
      setCollapsedNodes(prev => new Set(prev).add(nodeId));
      node.addClass('collapsed-parent');
    }
    setActiveMenu(null);
  };

  // Evidence badge helper
  const getEvidenceBadge = (nodeData: any) => {
    const ev = nodeData.evidence;
    let parsed = [];
    try {
      parsed = typeof ev === 'string' ? JSON.parse(ev) : (Array.isArray(ev) ? ev : []);
    } catch { parsed = []; }
    const hasPubmed = parsed.length > 0 && parsed.some((e: any) => e.pubid);
    return hasPubmed
      ? { label: '● PubMed', bg: '#E6F1FB', color: '#185FA5' }
      : { label: '○ LLM', bg: '#f0f4f8', color: '#64748b' };
  };

  const hasChildren = (nodeId: string) => {
    if (!cyInstance) return false;
    return cyInstance.edges(`[source = "${nodeId}"]`).length > 0;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#f8fafc' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: '16px', right: '16px',
        display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 20
      }}>
        {[
          { label: '+', action: () => cyInstance?.zoom({ level: cyInstance.zoom() * 1.2, renderedPosition: { x: cyInstance.width() / 2, y: cyInstance.height() / 2 } }) },
          { label: '−', action: () => cyInstance?.zoom({ level: cyInstance.zoom() * 0.8, renderedPosition: { x: cyInstance.width() / 2, y: cyInstance.height() / 2 } }) },
          { label: 'FIT', action: () => cyInstance?.fit(undefined, 80) }
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            style={{
              width: '30px', height: '30px', background: '#fff',
              border: '0.5px solid #e2e8f0', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: btn.label === 'FIT' ? '9px' : '15px',
              color: '#64748b', cursor: 'pointer', fontWeight: 500
            }}
          >{btn.label}</button>
        ))}
      </div>

      {activeMenu && (
        <>
          {/* Top action menu */}
          <div style={{
            position: 'absolute', zIndex: 50,
            left: activeMenu.x, top: activeMenu.y - (activeMenu.renderedHeight / 2) - 8,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'auto'
          }}>
            <div style={{
              background: '#fff', border: '0.5px solid #e2e8f0',
              borderRadius: '10px', padding: '4px',
              display: 'flex', alignItems: 'center', gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}>
              {activeMenu.isSuggestion ? (
                <>
                  <button
                    onClick={() => { onAcceptSuggestion?.(activeMenu.suggestionObj); setActiveMenu(null); }}
                    style={{
                      width: '36px', height: '36px', background: '#EAF3DE',
                      border: '0.5px solid #C0DD97', borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#3B6D11'
                    }}
                    title="Accept"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { onDismissSuggestion?.(activeMenu.suggestionObj); setActiveMenu(null); }}
                    style={{
                      width: '36px', height: '36px', background: '#FCEBEB',
                      border: '0.5px solid #F09595', borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: '#A32D2D'
                    }}
                    title="Dismiss"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { onExploreNode?.(activeMenu.label, activeMenu.ancestors); setActiveMenu(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '7px 12px', background: '#E6F1FB',
                      border: '0.5px solid #B5D4F4', borderRadius: '8px',
                      color: '#185FA5', fontSize: '11px', fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Expand
                  </button>
                  {hasChildren(activeMenu.id) && (
                    <button
                      onClick={() => toggleCollapse(activeMenu.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '7px 12px', background: '#f8fafc',
                        border: '0.5px solid #e2e8f0', borderRadius: '8px',
                        color: '#64748b', fontSize: '11px', fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      {collapsedNodes.has(activeMenu.id) ? '↓ Expand' : '↑ Collapse'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Bottom evidence badge + info */}
          <div style={{
            position: 'absolute', zIndex: 50,
            left: activeMenu.x, top: activeMenu.y + (activeMenu.renderedHeight / 2) + 8,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto'
          }}>
            <div style={{
              background: '#fff', border: '0.5px solid #e2e8f0',
              borderRadius: '8px', padding: '4px 8px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              {/* Evidence badge */}
              {(() => {
                const badge = getEvidenceBadge(activeMenu.nodeData);
                return (
                  <span style={{
                    fontSize: '10px', fontWeight: 500,
                    background: badge.bg, color: badge.color,
                    padding: '2px 6px', borderRadius: '4px'
                  }}>
                    {badge.label}
                  </span>
                );
              })()}
              <button
                onClick={e => { e.stopPropagation(); onNodeClick(activeMenu.nodeData); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'none', border: 'none', color: '#185FA5',
                  fontSize: '11px', cursor: 'pointer', padding: '2px 4px'
                }}
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Evidence
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

MindMapInner.displayName = 'MindMap';
export default MindMapInner;