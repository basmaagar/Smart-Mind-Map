import React, { useState, useRef } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import MindMap from './components/MindMap';
import type { MindMapHandle } from './components/MindMap';
import Sidebar from './components/Sidebar';
import ProjectMenu from './components/ProjectMenu';

const API_BASE = "http://127.0.0.1:8000";

interface Suggestion {
  name: string;
  evidence: any;
  parent: string;
  stage?: string;
}

// --- SYMPTOM DETECTION ---
const SYMPTOM_LIST = [
  'chest pain', 'dyspnea', 'shortness of breath', 'fever', 'headache',
  'fatigue', 'cough', 'palpitations', 'syncope', 'nausea', 'vomiting',
  'dizziness', 'abdominal pain', 'back pain', 'joint pain', 'rash',
  'bleeding', 'swelling', 'edema', 'weakness', 'confusion', 'seizure',
  'diarrhea', 'constipation', 'dysuria', 'hematuria', 'hemoptysis',
  'weight loss', 'weight gain', 'night sweats', 'insomnia', 'anxiety',
  'depression', 'palpitation', 'tachycardia', 'bradycardia', 'hypertension',
  'hypotension', 'paresthesia', 'numbness', 'tingling', 'blurred vision',
  'diplopia', 'hearing loss', 'tinnitus', 'dysphagia', 'odynophagia'
];

const isSymptom = (concept: string): boolean => {
  const lower = concept.toLowerCase().trim();
  return SYMPTOM_LIST.some(s => lower.includes(s) || s.includes(lower));
};

// --- CLINICAL STAGES ---
const STAGES = [
  { id: 'differential', label: 'Differential Dx',  color: '#ff6b35' },
  { id: 'mechanism',    label: 'Pathophysiology',   color: '#007fff' },
  { id: 'workup',       label: 'Diagnostic Workup', color: '#aa44ff' },
  { id: 'treatment',    label: 'Treatment',         color: '#00cc88' },
  { id: 'monitoring',   label: 'Monitoring',        color: '#ffaa00' },
];

// --- CATEGORY KEYWORDS ---
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  symptom: [
    'pain', 'fever', 'cough', 'fatigue', 'nausea', 'vomiting', 'dizziness',
    'headache', 'dyspnea', 'bleeding', 'swelling', 'rash', 'seizure',
    'syncope', 'palpitation', 'paresthesia', 'weakness', 'confusion',
    'insomnia', 'anorexia', 'diarrhea', 'constipation', 'dysuria',
    'tachycardia', 'bradycardia', 'hypotension', 'hypertension', 'sign',
    'symptom', 'presentation', 'complaint', 'manifestation'
  ],
  treatment: [
    'treatment', 'therapy', 'drug', 'medication', 'antibiotic', 'surgery',
    'intervention', 'management', 'protocol', 'regimen', 'dose', 'dosage',
    'prescription', 'vaccine', 'immunotherapy', 'chemotherapy', 'radiation',
    'rehabilitation', 'physiotherapy', 'inhibitor', 'antagonist', 'agonist',
    'remedy', 'cure', 'prophylaxis', 'prevention', 'surgical', 'resection',
    'transplant', 'dialysis', 'procedure', 'operation'
  ],
  mechanism: [
    'mechanism', 'pathophysiology', 'pathway', 'signaling', 'cascade',
    'receptor', 'enzyme', 'protein', 'gene', 'mutation', 'expression',
    'regulation', 'metabolism', 'synthesis', 'inhibition', 'activation',
    'inflammatory', 'oxidative', 'apoptosis', 'necrosis', 'fibrosis',
    'autoimmune', 'immune', 'cytokine', 'antibody', 'antigen', 'cell'
  ],
  risk: [
    'risk', 'factor', 'predisposition', 'comorbidity', 'obesity', 'smoking',
    'alcohol', 'diabetes', 'hypertension', 'age', 'genetic', 'hereditary',
    'lifestyle', 'sedentary', 'diet', 'exposure', 'environmental',
    'occupational', 'socioeconomic', 'epidemiology'
  ],
  diagnosis: [
    'diagnosis', 'diagnostic', 'imaging', 'biopsy', 'laboratory', 'test',
    'assay', 'marker', 'biomarker', 'screening', 'assessment', 'evaluation',
    'mri', 'ct', 'xray', 'ultrasound', 'ecg', 'eeg', 'endoscopy',
    'culture', 'pcr', 'serology', 'histology', 'cytology', 'differential'
  ]
};

export const classifyNode = (label: string): string => {
  const lower = label.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'default';
};

// --- EXPORT UTILITIES ---
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const buildHierarchy = (elements: any[]): { node: any; depth: number }[] => {
  const nodes = elements.filter(e => e.group === 'nodes' && !e.data.isSuggestion);
  const edges = elements.filter(e => e.group === 'edges');
  const targetIds = new Set(edges.map(e => e.data.target));
  const rootNode = nodes.find(n => !targetIds.has(n.data.id)) || nodes[0];
  if (!rootNode) return [];
  const result: { node: any; depth: number }[] = [];
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: rootNode.data.id, depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find(n => n.data.id === id);
    if (node) result.push({ node, depth });
    edges.filter(e => e.data.source === id).forEach(e => {
      if (!visited.has(e.data.target)) queue.push({ id: e.data.target, depth: depth + 1 });
    });
  }
  return result;
};

const exportMarkdown = (elements: any[], projectTitle: string) => {
  const hierarchy = buildHierarchy(elements);
  if (hierarchy.length === 0) return;
  const lines = [`# ${projectTitle}\n`, `*Generated by MedMind OS — ${new Date().toLocaleDateString()}*\n`];
  hierarchy.forEach(({ node, depth }) => {
    const indent = '  '.repeat(depth);
    const bullet = depth === 0 ? '##' : `${indent}-`;
    const category = classifyNode(node.data.label);
    const tag = category !== 'default' ? ` *(${category})*` : '';
    lines.push(`${bullet} ${node.data.label}${tag}`);
  });
  downloadFile(lines.join('\n'), `${projectTitle}.md`, 'text/markdown');
};

const exportJSON = (elements: any[], projectTitle: string) => {
  const exportData = {
    title: projectTitle,
    exported_at: new Date().toISOString(),
    nodes: elements
      .filter(e => e.group === 'nodes' && !e.data.isSuggestion)
      .map(e => ({
        id: e.data.id,
        label: e.data.label,
        category: classifyNode(e.data.label),
        isRoot: e.data.isRoot || false,
        evidence: e.data.evidence || []
      })),
    edges: elements
      .filter(e => e.group === 'edges' && !e.classes?.includes('suggestion-edge'))
      .map(e => ({ source: e.data.source, target: e.data.target }))
  };
  downloadFile(JSON.stringify(exportData, null, 2), `${projectTitle}.json`, 'application/json');
};

const exportPDF = (elements: any[], projectTitle: string) => {
  const hierarchy = buildHierarchy(elements);
  if (hierarchy.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(0, 127, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('MEDMIND OS — KNOWLEDGE MAP', margin, 12);
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 20);
  doc.text('Powered by PubMed RAG', pageWidth - margin - 40, 20);
  y = 40;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(projectTitle.toUpperCase(), margin, y);
  y += 10;
  doc.setDrawColor(0, 127, 255);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;
  const categoryColors: Record<string, [number, number, number]> = {
    symptom:   [255, 77,  77],
    treatment: [0,   204, 136],
    mechanism: [0,   127, 255],
    risk:      [255, 170, 0],
    diagnosis: [170, 68,  255],
    default:   [80,  80,  80]
  };
  hierarchy.forEach(({ node, depth }) => {
    if (y > 270) { doc.addPage(); y = margin; }
    const label = node.data.label;
    const category = classifyNode(label);
    const color = categoryColors[category] || categoryColors.default;
    const indentX = margin + depth * 8;
    const fontSize = depth === 0 ? 13 : depth === 1 ? 11 : 9;
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(indentX + 2, y - 1.5, 1.5, 'F');
    doc.setTextColor(depth === 0 ? 0 : 40, depth === 0 ? 0 : 40, depth === 0 ? 0 : 40);
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', depth === 0 ? 'bold' : 'normal');
    doc.text(label, indentX + 6, y);
    if (category !== 'default') {
      doc.setFontSize(6);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`[${category.toUpperCase()}]`, indentX + 6 + doc.getTextWidth(label) + 2, y);
    }
    y += depth === 0 ? 8 : 6;
  });
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text('MedMind OS — AI-Powered Medical Knowledge Mapping | PubMed RAG', margin, 290);
  doc.save(`${projectTitle}.pdf`);
};

const App: React.FC = () => {
  const [elements, setElements] = useState<any[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<Suggestion[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string, label: string, evidence: any[] } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // --- CLINICAL MODE STATE ---
  const [pendingSymptom, setPendingSymptom] = useState<string | null>(null); // triggers banner
  const [clinicalMode, setClinicalMode] = useState(false);
  const [rootSymptom, setRootSymptom] = useState<string | null>(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [acceptedPerStage, setAcceptedPerStage] = useState<Record<string, string[]>>({});

  const mindMapRef = useRef<MindMapHandle>(null);
  const projectTitle = elements.find(e => e.data?.isRoot)?.data?.label || 'MedMind_Export';

  const fetchGraph = async (projectId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/projects/${projectId}`);
      setElements([...res.data]);
      setCurrentProjectId(projectId);
    } catch (err) {
      console.error("Error fetching graph:", err);
    }
  };

  // --- NORMAL GENERATE ---
  const handleGenerate = async (concept: string, ancestors: string[] = []) => {
    if (!concept.trim()) return;

    // Check if this is a root concept (no project yet) and it's a symptom
    if (!currentProjectId && isSymptom(concept)) {
      setPendingSymptom(concept);
      setSearchInput("");
      return; // wait for user to choose mode via banner
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest`, {
        concept,
        project_id: currentProjectId,
        ancestors
      });
      const { project_id, parent, suggestions } = res.data;
      if (!currentProjectId) setCurrentProjectId(project_id);
      await fetchGraph(project_id);
      const newSuggestions = suggestions.map((s: any) => ({
        ...s,
        evidence: typeof s.evidence === 'string' ? JSON.parse(s.evidence) : s.evidence,
        parent
      }));
      setPendingSuggestions(prev => [...prev, ...newSuggestions]);
      setSearchInput("");
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- CLINICAL MODE GENERATE ---
  const handleClinicalGenerate = async (concept: string, stage: string) => {
    if (!rootSymptom) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest-staged`, {
        symptom: rootSymptom,
        concept,
        stage,
        accepted_nodes: acceptedPerStage[stage] || [],
        project_id: currentProjectId
      });
      const { project_id, parent, suggestions } = res.data;
      if (!currentProjectId) setCurrentProjectId(project_id);
      await fetchGraph(project_id);
      const newSuggestions = suggestions.map((s: any) => ({
        ...s,
        evidence: typeof s.evidence === 'string' ? JSON.parse(s.evidence) : s.evidence,
        parent,
        stage
      }));
      setPendingSuggestions(prev => [...prev, ...newSuggestions]);
    } catch (err) {
      console.error("Clinical generation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- ENTER CLINICAL MODE ---
 const enterClinicalMode = async () => {
    if (!pendingSymptom) return;
    const symptom = pendingSymptom; // capture before clearing
    setClinicalMode(true);
    setRootSymptom(symptom);
    setCurrentStageIndex(0);
    setAcceptedPerStage({});
    setPendingSymptom(null);
    // Pass symptom directly instead of relying on rootSymptom state
    await handleClinicalGenerateWithSymptom(symptom, symptom, 'differential');
};

const handleClinicalGenerateWithSymptom = async (symptom: string, concept: string, stage: string) => {
    setLoading(true);
    try {
        const res = await axios.post(`${API_BASE}/suggest-staged`, {
            symptom,
            concept,
            stage,
            accepted_nodes: [],
            project_id: currentProjectId
        });
        const { project_id, parent, suggestions } = res.data;
        if (!currentProjectId) setCurrentProjectId(project_id);
        await fetchGraph(project_id);
        const newSuggestions = suggestions.map((s: any) => ({
            ...s,
            evidence: typeof s.evidence === 'string' ? JSON.parse(s.evidence) : s.evidence,
            parent,
            stage
        }));
        setPendingSuggestions(prev => [...prev, ...newSuggestions]);
    } catch (err) {
        console.error("Clinical generation failed:", err);
    } finally {
        setLoading(false);
    }
};

  // --- CONTINUE AS NORMAL MAP ---
  const enterNormalMode = async () => {
    if (!pendingSymptom) return;
    const concept = pendingSymptom;
    setPendingSymptom(null);
    await handleGenerate(concept);
  };

  // --- ACCEPT SUGGESTION ---
  const handleAcceptSuggestion = async (sug: Suggestion) => {
    if (!currentProjectId) return;
    try {
      await axios.post(`${API_BASE}/accept-suggestion`, {
        project_id: currentProjectId,
        parent_concept: sug.parent,
        child_concept: sug.name,
        evidence: typeof sug.evidence === 'string' ? sug.evidence : JSON.stringify(sug.evidence)
      });
      setPendingSuggestions(prev => prev.filter(s => s.name !== sug.name || s.parent !== sug.parent));
      await fetchGraph(currentProjectId);

      // Track accepted nodes per stage in clinical mode
      if (clinicalMode && sug.stage) {
        setAcceptedPerStage(prev => ({
          ...prev,
          [sug.stage!]: [...(prev[sug.stage!] || []), sug.name]
        }));
      }
    } catch (err) {
      console.error("Error accepting suggestion:", err);
    }
  };

  const handleDismissSuggestion = (sug: Suggestion) => {
    setPendingSuggestions(prev => prev.filter(s => s.name !== sug.name || s.parent !== sug.parent));
  };

  const onNodeClick = (nodeData: any) => {
    try {
      const evField = nodeData.evidence;
      let parsed = [];
      if (typeof evField === 'string') parsed = JSON.parse(evField);
      else if (Array.isArray(evField)) parsed = evField;
      setSelectedNode({ id: nodeData.id, label: nodeData.label, evidence: parsed });
    } catch (e) {
      setSelectedNode({ id: nodeData.id, label: nodeData.label, evidence: [] });
    }
  };

  const handleNewProject = () => {
    setElements([]);
    setPendingSuggestions([]);
    setCurrentProjectId(null);
    setSelectedNode(null);
    setSearchInput("");
    setClinicalMode(false);
    setRootSymptom(null);
    setPendingSymptom(null);
    setCurrentStageIndex(0);
    setAcceptedPerStage({});
  };

  // Current stage has accepted nodes → allow advancing
  const currentStage = STAGES[currentStageIndex];
  const canAdvance = clinicalMode &&
    (acceptedPerStage[currentStage?.id] || []).length > 0 &&
    currentStageIndex < STAGES.length - 1;

  const handleAdvanceStage = () => {
    const nextIndex = currentStageIndex + 1;
    setCurrentStageIndex(nextIndex);
    const firstAccepted = (acceptedPerStage[currentStage.id] || [])[0];
    if (firstAccepted && rootSymptom) {
        // rootSymptom is safe here because it was set earlier and hasn't changed
        handleClinicalGenerateWithSymptom(rootSymptom, firstAccepted, STAGES[nextIndex].id);
    }
};

  const handleGoBackStage = () => {
    if (currentStageIndex > 0) {
      setCurrentStageIndex(prev => prev - 1);
    }
  };

  // Export handlers
  const handleExportPNG = () => {
    const cy = mindMapRef.current?.getCy();
    if (!cy) return;
    const png = cy.png({ output: 'blob', bg: '#000000', full: true, scale: 2 });
    const url = URL.createObjectURL(png as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };
  const handleExportPDF = () => { exportPDF(finalElements, projectTitle); setShowExportMenu(false); };
  const handleExportMarkdown = () => { exportMarkdown(finalElements, projectTitle); setShowExportMenu(false); };
  const handleExportJSON = () => { exportJSON(finalElements, projectTitle); setShowExportMenu(false); };

  const processHierarchy = (els: any[]) => {
    const nodes = els.filter(e => e.group === 'nodes');
    const edges = els.filter(e => e.group === 'edges');
    const targetIds = new Set(edges.map(e => e.data.target));
    const rootNodes = nodes.filter(n => !targetIds.has(n.data.id));
    const root = rootNodes.length > 0
      ? rootNodes.sort((a, b) => {
          const aCount = edges.filter(e => e.data.source === a.data.id).length;
          const bCount = edges.filter(e => e.data.source === b.data.id).length;
          return bCount - aCount;
        })[0]
      : nodes[0];

    const depths: Record<string, number> = {};
    if (root) {
      const queue = [{ id: root.data.id, d: 0 }];
      depths[root.data.id] = 0;
      while (queue.length > 0) {
        const { id, d } = queue.shift()!;
        edges.filter(e => e.data.source === id).forEach(e => {
          if (depths[e.data.target] === undefined) {
            depths[e.data.target] = d + 1;
            queue.push({ id: e.data.target, d: d + 1 });
          }
        });
      }
    }

    return els.map(el => {
      if (el.group === 'nodes') {
        const depth = depths[el.data.id] || 0;
        const category = el.data.isSuggestion ? 'suggestion-node' : classifyNode(el.data.label || '');
        return {
          ...el,
          data: { ...el.data, isRoot: el.data.id === root?.data.id, depth, label: el.data.label || "", category }
        };
      } else {
        const sourceDepth = depths[el.data.source] || 0;
        const targetNode = nodes.find(n => n.data.id === el.data.target);
        const hasEvidence = targetNode && targetNode.data.evidence && targetNode.data.evidence.length > 0;
        return { ...el, data: { ...el.data, depth: sourceDepth, isValidated: hasEvidence } };
      }
    });
  };

  // Get all node IDs that will exist in the graph
  const existingNodeIds = new Set([
    ...elements.filter(e => e.group === 'nodes').map(e => e.data.id),
  ]);

  const suggestionNodes = pendingSuggestions.map(sug => ({
    group: 'nodes',
    classes: 'suggestion',
    data: {
      id: `sug-${sug.name.toLowerCase().trim()}`,
      label: sug.name,
      isSuggestion: true,
      evidence: sug.evidence,
      parentId: sug.parent,
      suggestionObj: sug,
      stage: sug.stage
    }
  }));

  // Track suggestion node IDs too
  const allNodeIds = new Set([
    ...existingNodeIds,
    ...suggestionNodes.map(n => n.data.id)
  ]);

  const suggestionEdges = pendingSuggestions
    .filter(sug => {
      const sourceId = sug.parent.toLowerCase().trim();
      const targetId = `sug-${sug.name.toLowerCase().trim()}`;
      // Only create edge if both source and target exist
      return allNodeIds.has(sourceId) && allNodeIds.has(targetId);
    })
    .map(sug => ({
      group: 'edges',
      classes: 'suggestion-edge',
      data: {
        id: `edge-sug-${sug.parent.toLowerCase().trim()}-${sug.name.toLowerCase().trim()}`,
        source: sug.parent.toLowerCase().trim(),
        target: `sug-${sug.name.toLowerCase().trim()}`
      }
    }));

  const allElements = [
    ...elements,
    ...suggestionNodes,
    ...suggestionEdges
  ];;

  const finalElements = processHierarchy(allElements);

  const legendItems = [
    { color: '#ff4d4d', label: 'Symptom / Sign' },
    { color: '#00cc88', label: 'Treatment / Drug' },
    { color: '#007fff', label: 'Mechanism / Pathway' },
    { color: '#ffaa00', label: 'Risk Factor' },
    { color: '#aa44ff', label: 'Diagnosis / Test' },
    { color: '#00bfff', label: 'Root Concept' },
    { color: '#ffffff', label: 'Validated Pathway' },
    { color: '#00ff00', label: 'Evidence Verified' },
  ];

  const exportOptions = [
    { label: 'PNG',  sublabel: 'Canvas Screenshot',  action: handleExportPNG,      color: '#007fff' },
    { label: 'PDF',  sublabel: 'Structured Document', action: handleExportPDF,      color: '#aa44ff' },
    { label: 'MD',   sublabel: 'Markdown Outline',    action: handleExportMarkdown, color: '#00cc88' },
    { label: 'JSON', sublabel: 'Raw Graph Data',      action: handleExportJSON,     color: '#ffaa00' },
  ];

  return (
    <div className="app-container" style={{ backgroundColor: 'black', color: 'white', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <ProjectMenu isOpen={isHistoryOpen} setIsOpen={setIsHistoryOpen} onSelectProject={fetchGraph} onNewProject={handleNewProject} />

      {/* Top Status Bar */}
      <header style={{ height: '56px', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', backgroundColor: 'black', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <h1 style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.2em', color: '#007fff', margin: 0, textTransform: 'uppercase' }}>MEDMIND OS (KERNEL V1.0)</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: clinicalMode ? '#ff6b35' : '#00ff00', boxShadow: `0 0 8px ${clinicalMode ? '#ff6b35' : '#00ff00'}` }} />
            <span style={{ fontSize: '9px', fontWeight: 'bold', color: clinicalMode ? '#ff6b35' : 'rgba(0,255,0,0.8)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {clinicalMode ? 'Clinical_Mode' : 'System Live'}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: '600px', padding: '0 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#050505', border: '1px solid #111', padding: '6px 16px', borderRadius: '2px' }}>
            <svg width="12" height="12" style={{ color: '#007fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <input
              style={{ flex: 1, backgroundColor: 'transparent', border: 'none', color: 'white', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase', outline: 'none' }}
              placeholder={clinicalMode ? `Clinical Mode — ${currentStage?.label}` : "Initialize Command..."}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate(searchInput)}
              disabled={clinicalMode}
            />
            {loading && <div style={{ width: '12px', height: '12px', border: '2px solid #007fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(prev => !prev)}
              disabled={elements.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                backgroundColor: elements.length === 0 ? 'transparent' : 'rgba(0,127,255,0.1)',
                border: '1px solid', borderColor: elements.length === 0 ? '#222' : '#007fff',
                color: elements.length === 0 ? '#333' : '#007fff',
                padding: '4px 12px', fontSize: '9px', fontWeight: 'bold',
                textTransform: 'uppercase', letterSpacing: '0.2em',
                cursor: elements.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Export
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: '#050505', border: '1px solid #222', minWidth: '160px', zIndex: 100, boxShadow: '0 0 20px rgba(0,0,0,0.8)' }}>
                {exportOptions.map(opt => (
                  <button
                    key={opt.label}
                    onClick={opt.action}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid #111', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '9px', fontWeight: 'bold', color: opt.color, width: '28px', letterSpacing: '0.1em' }}>{opt.label}</span>
                    <span style={{ fontSize: '8px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{opt.sublabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <aside style={{ width: '256px', borderRight: '1px solid #111', display: 'flex', flexDirection: 'column', backgroundColor: 'black', flexShrink: 0 }}>
          <div style={{ padding: '24px', borderBottom: '1px solid #111' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '2px', backgroundColor: '#050505', border: '1px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '9px', color: '#007fff', fontWeight: 'bold' }}>HUB</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Research Hub</span>
                <span style={{ fontSize: '7px', color: '#333', textTransform: 'uppercase', fontWeight: 'bold' }}>Society_ID: 8829-X</span>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: '16px 8px', overflowY: 'auto' }}>
            {[
              { id: 'neural', label: 'Neural Graph', icon: 'M13 10V3L4 14h7v7l9-11h-7z', active: true },
              { id: 'history', label: 'Session History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
              { id: 'trials', label: 'Clinical Trials', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
              { id: 'pubmed', label: 'PubMed Sync', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'history') setIsHistoryOpen(true);
                  if (item.id === 'neural') handleNewProject();
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', border: 'none', background: item.active ? 'rgba(0,127,255,0.05)' : 'none', borderLeft: item.active ? '2px solid #007fff' : 'none', color: item.active ? '#007fff' : '#333', cursor: 'pointer', textAlign: 'left' }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}></path></svg>
                <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.2em' }}>{item.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ padding: '24px', borderTop: '1px solid #111' }}>
            <span style={{ fontSize: '7px', color: '#222', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.4em' }}>System Kernel</span>
          </div>
        </aside>

        {/* Main Canvas */}
        <main style={{ flex: 1, position: 'relative', backgroundColor: 'black', backgroundImage: 'radial-gradient(circle, #111 1px, transparent 1px)', backgroundSize: '30px 30px', overflow: 'hidden' }}>

          {/* SYMPTOM DETECTION BANNER */}
          {pendingSymptom && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40,
              backgroundColor: '#050505', borderBottom: '1px solid #ff6b35',
              padding: '12px 24px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '16px' }}>⚕</span>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ff6b35', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                    "{pendingSymptom}" detected as a clinical symptom
                  </span>
                  <p style={{ fontSize: '8px', color: '#444', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Choose how to explore this concept
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={enterClinicalMode}
                  style={{
                    padding: '8px 16px', backgroundColor: 'rgba(255,107,53,0.15)',
                    border: '1px solid #ff6b35', color: '#ff6b35',
                    fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase',
                    letterSpacing: '0.2em', cursor: 'pointer'
                  }}
                >
                  ⚕ Enter Clinical Reasoning Mode
                </button>
                <button
                  onClick={enterNormalMode}
                  style={{
                    padding: '8px 16px', backgroundColor: 'rgba(0,127,255,0.1)',
                    border: '1px solid #007fff', color: '#007fff',
                    fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase',
                    letterSpacing: '0.2em', cursor: 'pointer'
                  }}
                >
                  Continue as Knowledge Map
                </button>
              </div>
            </div>
          )}

          {/* CLINICAL STAGE PROGRESS BAR */}
          {clinicalMode && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
              backgroundColor: '#050505', borderBottom: '1px solid #111',
              padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              {/* Back button */}
              <button
                onClick={handleGoBackStage}
                disabled={currentStageIndex === 0}
                style={{
                  background: 'none', border: '1px solid #222', color: currentStageIndex === 0 ? '#222' : '#444',
                  padding: '4px 8px', fontSize: '8px', fontWeight: 'bold', cursor: currentStageIndex === 0 ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: '8px'
                }}
              >← Back</button>

              {/* Stage pills */}
              {STAGES.map((stage, idx) => {
                const isActive = idx === currentStageIndex;
                const isDone = idx < currentStageIndex;
                const isLocked = idx > currentStageIndex;
                return (
                  <React.Fragment key={stage.id}>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 12px',
                        backgroundColor: isActive ? `${stage.color}22` : 'transparent',
                        border: `1px solid ${isActive ? stage.color : isDone ? '#333' : '#111'}`,
                        opacity: isLocked ? 0.3 : 1,
                        transition: 'all 0.3s'
                      }}
                    >
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        backgroundColor: isDone ? '#00ff00' : isActive ? stage.color : '#222'
                      }} />
                      <span style={{
                        fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: isActive ? stage.color : isDone ? '#444' : '#222'
                      }}>{stage.label}</span>
                    </div>
                    {idx < STAGES.length - 1 && (
                      <div style={{ width: '16px', height: '1px', backgroundColor: idx < currentStageIndex ? '#333' : '#111' }} />
                    )}
                  </React.Fragment>
                );
              })}

              {/* Advance button */}
              <button
                onClick={handleAdvanceStage}
                disabled={!canAdvance}
                style={{
                  marginLeft: '8px', padding: '4px 12px',
                  backgroundColor: canAdvance ? `${STAGES[currentStageIndex + 1]?.color}22` : 'transparent',
                  border: `1px solid ${canAdvance ? STAGES[currentStageIndex + 1]?.color : '#222'}`,
                  color: canAdvance ? STAGES[currentStageIndex + 1]?.color : '#222',
                  fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase',
                  letterSpacing: '0.1em', cursor: canAdvance ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s'
                }}
              >
                Next: {STAGES[currentStageIndex + 1]?.label || 'Complete'} →
              </button>
            </div>
          )}

          <div style={{ position: 'absolute', inset: 0, top: clinicalMode || pendingSymptom ? '45px' : '0' }}>
            <MindMap
              ref={mindMapRef}
              elements={finalElements}
              onExploreNode={(label, ancestors) => handleGenerate(label, ancestors)}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={(label, ancestors) => handleGenerate(label, ancestors)}
              onAcceptSuggestion={handleAcceptSuggestion}
              onDismissSuggestion={handleDismissSuggestion}
            />
          </div>

          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
              <div style={{ position: 'relative', width: '400px', height: '400px', borderRadius: '50%', border: '1px solid rgba(0,127,255,0.2)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'conic-gradient(from 0deg, transparent, rgba(0,127,255,0.4))', animation: 'radar-spin 4s linear infinite' }} />
                <div style={{ position: 'absolute', inset: '25%', border: '1px solid rgba(0,127,255,0.1)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', inset: '50%', border: '1px solid rgba(0,127,255,0.1)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#007fff', textTransform: 'uppercase', letterSpacing: '0.4em', animation: 'pulse 1s infinite' }}>
                    {clinicalMode ? `Generating ${currentStage?.label}...` : 'Analyzing_Literature_Nodes...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: '24px', left: '24px', padding: '16px', border: '1px solid #111', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 20 }}>
            {legendItems.map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '8px', height: '8px', backgroundColor: color, borderRadius: '1px', flexShrink: 0 }} />
                <span style={{ fontSize: '7px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
              </div>
            ))}
          </div>
        </main>

        <Sidebar data={selectedNode} onClose={() => setSelectedNode(null)} key={selectedNode?.id} />
      </div>
    </div>
  );
};

export default App;
