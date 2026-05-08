import cytoscape from 'cytoscape';

export interface MindMapHandle {
  getCy: () => cytoscape.Core | null;
}