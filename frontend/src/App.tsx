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

const STAGES = [
  { id: 'differential', label: 'Differential Dx',  color: '#E24B4A' },
  { id: 'mechanism',    label: 'Pathophysiology',   color: '#185FA5' },
  { id: 'workup',       label: 'Diagnostic Workup', color: '#7F77DD' },
  { id: 'treatment',    label: 'Treatment',         color: '#1D9E75' },
  { id: 'monitoring',   label: 'Monitoring',        color: '#BA7517' },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  symptom: ['pain','fever','cough','fatigue','nausea','vomiting','dizziness','headache','dyspnea','bleeding','swelling','rash','seizure','syncope','palpitation','paresthesia','weakness','confusion','insomnia','anorexia','diarrhea','constipation','dysuria','tachycardia','bradycardia','hypotension','hypertension','sign','symptom','presentation','complaint','manifestation'],
  treatment: ['treatment','therapy','drug','medication','antibiotic','surgery','intervention','management','protocol','regimen','dose','dosage','prescription','vaccine','immunotherapy','chemotherapy','radiation','rehabilitation','physiotherapy','inhibitor','antagonist','agonist','remedy','cure','prophylaxis','prevention','surgical','resection','transplant','dialysis','procedure','operation'],
  mechanism: ['mechanism','pathophysiology','pathway','signaling','cascade','receptor','enzyme','protein','gene','mutation','expression','regulation','metabolism','synthesis','inhibition','activation','inflammatory','oxidative','apoptosis','necrosis','fibrosis','autoimmune','immune','cytokine','antibody','antigen','cell'],
  risk: ['risk','factor','predisposition','comorbidity','obesity','smoking','alcohol','diabetes','hypertension','age','genetic','hereditary','lifestyle','sedentary','diet','exposure','environmental','occupational','socioeconomic','epidemiology'],
  diagnosis: ['diagnosis','diagnostic','imaging','biopsy','laboratory','test','assay','marker','biomarker','screening','assessment','evaluation','mri','ct','xray','ultrasound','ecg','eeg','endoscopy','culture','pcr','serology','histology','cytology','differential']
};

export const classifyNode = (label: string): string => {
  const lower = label.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'default';
};

// Export utilities
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
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
  if (!hierarchy.length) return;
  const lines = [`# ${projectTitle}\n`, `*Generated by MedMind — ${new Date().toLocaleDateString()}*\n`];
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
  const data = {
    title: projectTitle, exported_at: new Date().toISOString(),
    nodes: elements.filter(e => e.group === 'nodes' && !e.data.isSuggestion).map(e => ({
      id: e.data.id, label: e.data.label,
      category: classifyNode(e.data.label),
      isRoot: e.data.isRoot || false, evidence: e.data.evidence || []
    })),
    edges: elements.filter(e => e.group === 'edges' && !e.classes?.includes('suggestion-edge')).map(e => ({
      source: e.data.source, target: e.data.target
    }))
  };
  downloadFile(JSON.stringify(data, null, 2), `${projectTitle}.json`, 'application/json');
};

const exportPDF = (elements: any[], projectTitle: string) => {
  const hierarchy = buildHierarchy(elements);
  if (!hierarchy.length) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;
  doc.setFillColor(24, 95, 165);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('MedMind — Clinical Knowledge Map', margin, 12);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 20);
  y = 40;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(projectTitle.toUpperCase(), margin, y);
  y += 10;
  doc.setDrawColor(24, 95, 165); doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;
  const categoryColors: Record<string, [number, number, number]> = {
    symptom: [226,75,74], treatment: [29,158,117],
    mechanism: [24,95,165], risk: [186,117,23],
    diagnosis: [127,119,221], default: [100,116,139]
  };
  hierarchy.forEach(({ node, depth }) => {
    if (y > 270) { doc.addPage(); y = margin; }
    const label = node.data.label;
    const category = classifyNode(label);
    const color = categoryColors[category] || categoryColors.default;
    const indentX = margin + depth * 8;
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(indentX + 2, y - 1.5, 1.5, 'F');
    doc.setTextColor(depth === 0 ? 0 : 40, depth === 0 ? 0 : 40, depth === 0 ? 0 : 40);
    doc.setFontSize(depth === 0 ? 13 : depth === 1 ? 11 : 9);
    doc.setFont('helvetica', depth === 0 ? 'bold' : 'normal');
    doc.text(label, indentX + 6, y);
    if (category !== 'default') {
      doc.setFontSize(6);
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(`[${category.toUpperCase()}]`, indentX + 6 + doc.getTextWidth(label) + 2, y);
    }
    y += depth === 0 ? 8 : 6;
  });
  doc.setTextColor(150, 150, 150); doc.setFontSize(7);
  doc.text('MedMind — AI-Powered Medical Knowledge Mapping | PubMed RAG', margin, 290);
  doc.save(`${projectTitle}.pdf`);
};

const App: React.FC = () => {
  const [elements, setElements] = useState<any[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<Suggestion[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; evidence: any[] } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [mapSearchTerm, setMapSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [pendingSymptom, setPendingSymptom] = useState<string | null>(null);
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
    } catch (err) { console.error("Error fetching graph:", err); }
  };

  const handleGenerate = async (concept: string, ancestors: string[] = []) => {
    if (!concept.trim()) return;
    if (!currentProjectId && isSymptom(concept)) {
      setPendingSymptom(concept);
      setSearchInput("");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest`, { concept, project_id: currentProjectId, ancestors });
      const { project_id, parent, suggestions } = res.data;
      if (!currentProjectId) setCurrentProjectId(project_id);
      await fetchGraph(project_id);
      setPendingSuggestions(prev => [...prev, ...suggestions.map((s: any) => ({
        ...s,
        evidence: typeof s.evidence === 'string' ? JSON.parse(s.evidence) : s.evidence,
        parent
      }))]);
      setSearchInput("");
    } catch (err) { console.error("Generation failed:", err); }
    finally { setLoading(false); }
  };

  const handleClinicalGenerateWithSymptom = async (symptom: string, concept: string, stage: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest-staged`, {
        symptom, concept, stage, accepted_nodes: [], project_id: currentProjectId
      });
      const { project_id, parent, suggestions } = res.data;
      if (!currentProjectId) setCurrentProjectId(project_id);
      await fetchGraph(project_id);
      setPendingSuggestions(prev => [...prev, ...suggestions.map((s: any) => ({
        ...s,
        evidence: typeof s.evidence === 'string' ? JSON.parse(s.evidence) : s.evidence,
        parent, stage
      }))]);
    } catch (err) { console.error("Clinical generation failed:", err); }
    finally { setLoading(false); }
  };

  const enterClinicalMode = async () => {
    if (!pendingSymptom) return;
    const symptom = pendingSymptom;
    setClinicalMode(true);
    setRootSymptom(symptom);
    setCurrentStageIndex(0);
    setAcceptedPerStage({});
    setPendingSymptom(null);
    await handleClinicalGenerateWithSymptom(symptom, symptom, 'differential');
  };

 const enterNormalMode = async () => {
  if (!pendingSymptom) return;
  const concept = pendingSymptom;
  setPendingSymptom(null);
  // Call the API directly, bypassing the symptom detection check
  setLoading(true);
  try {
    const res = await axios.post(`${API_BASE}/suggest`, {
      concept,
      project_id: currentProjectId,
      ancestors: []
    });
    const { project_id, parent, suggestions } = res.data;
    if (!currentProjectId) setCurrentProjectId(project_id);
    await fetchGraph(project_id);
    setPendingSuggestions(prev => [...prev, ...suggestions.map((s: any) => ({
      ...s,
      evidence: typeof s.evidence === 'string' ? JSON.parse(s.evidence) : s.evidence,
      parent
    }))]);
    setSearchInput("");
  } catch (err) {
    console.error("Generation failed:", err);
  } finally {
    setLoading(false);
  }
};

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
      if (clinicalMode && sug.stage) {
        setAcceptedPerStage(prev => ({
          ...prev,
          [sug.stage!]: [...(prev[sug.stage!] || []), sug.name]
        }));
      }
    } catch (err) { console.error("Error accepting:", err); }
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
    } catch { setSelectedNode({ id: nodeData.id, label: nodeData.label, evidence: [] }); }
  };

  const handleNewProject = () => {
    setElements([]); setPendingSuggestions([]); setCurrentProjectId(null);
    setSelectedNode(null); setSearchInput(""); setMapSearchTerm("");
    setClinicalMode(false); setRootSymptom(null);
    setPendingSymptom(null); setCurrentStageIndex(0); setAcceptedPerStage({});
  };

  const currentStage = STAGES[currentStageIndex];
  const canAdvance = clinicalMode &&
    (acceptedPerStage[currentStage?.id] || []).length > 0 &&
    currentStageIndex < STAGES.length - 1;

  const handleAdvanceStage = () => {
    const nextIndex = currentStageIndex + 1;
    setCurrentStageIndex(nextIndex);
    const firstAccepted = (acceptedPerStage[currentStage.id] || [])[0];
    if (firstAccepted && rootSymptom) {
      handleClinicalGenerateWithSymptom(rootSymptom, firstAccepted, STAGES[nextIndex].id);
    }
  };

  const handleGoBackStage = () => {
    if (currentStageIndex > 0) setCurrentStageIndex(prev => prev - 1);
  };

  // Progress ring calculation
  const stagesComplete = clinicalMode
    ? STAGES.filter(s => (acceptedPerStage[s.id] || []).length > 0).length
    : 0;
  const progressPercent = Math.round((stagesComplete / STAGES.length) * 100);
  const ringCircumference = 2 * Math.PI * 11;
  const ringOffset = ringCircumference - (progressPercent / 100) * ringCircumference;

  // Export handlers
  const handleExportPNG = () => {
    const cy = mindMapRef.current?.getCy();
    if (!cy) return;
    const png = cy.png({ output: 'blob', bg: '#f8fafc', full: true, scale: 2 });
    const url = URL.createObjectURL(png as Blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${projectTitle}.png`; a.click();
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
      ? rootNodes.sort((a, b) =>
          edges.filter(e => e.data.source === b.data.id).length -
          edges.filter(e => e.data.source === a.data.id).length
        )[0]
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
        return { ...el, data: { ...el.data, isRoot: el.data.id === root?.data.id, depth, label: el.data.label || "", category } };
      } else {
        const targetNode = nodes.find(n => n.data.id === el.data.target);
        const hasEvidence = targetNode?.data.evidence?.length > 0;
        return { ...el, data: { ...el.data, depth: depths[el.data.source] || 0, isValidated: hasEvidence } };
      }
    });
  };

  const existingNodeIds = new Set(elements.filter(e => e.group === 'nodes').map(e => e.data.id));
  const suggestionNodes = pendingSuggestions.map(sug => ({
    group: 'nodes', classes: 'suggestion',
    data: { id: `sug-${sug.name.toLowerCase().trim()}`, label: sug.name, isSuggestion: true, evidence: sug.evidence, parentId: sug.parent, suggestionObj: sug, stage: sug.stage }
  }));
  const allNodeIds = new Set([...existingNodeIds, ...suggestionNodes.map(n => n.data.id)]);
  const suggestionEdges = pendingSuggestions
    .filter(sug => allNodeIds.has(sug.parent.toLowerCase().trim()) && allNodeIds.has(`sug-${sug.name.toLowerCase().trim()}`))
    .map(sug => ({
      group: 'edges', classes: 'suggestion-edge',
      data: { id: `edge-sug-${sug.parent.toLowerCase().trim()}-${sug.name.toLowerCase().trim()}`, source: sug.parent.toLowerCase().trim(), target: `sug-${sug.name.toLowerCase().trim()}` }
    }));

  const finalElements = React.useMemo(() => processHierarchy([...elements, ...suggestionNodes, ...suggestionEdges]), [elements, suggestionNodes, suggestionEdges]);

  const exportOptions = [
    { label: 'PNG', sublabel: 'Canvas screenshot', action: handleExportPNG, color: '#185FA5' },
    { label: 'PDF', sublabel: 'Structured document', action: handleExportPDF, color: '#7F77DD' },
    { label: 'MD',  sublabel: 'Markdown outline',   action: handleExportMarkdown, color: '#1D9E75' },
    { label: 'JSON', sublabel: 'Raw graph data',    action: handleExportJSON, color: '#BA7517' },
  ];

  return (
    <div style={{ backgroundColor: '#f0f4f8', color: '#1a202c', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <ProjectMenu isOpen={isHistoryOpen} setIsOpen={setIsHistoryOpen} onSelectProject={fetchGraph} onNewProject={handleNewProject} />

      {/* Header */}
      <header style={{
        height: '52px', borderBottom: '0.5px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', backgroundColor: '#ffffff', zIndex: 50, gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ width: '28px', height: '28px', background: '#185FA5', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" fill="none" stroke="#fff" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a202c', lineHeight: 1 }}>MedMind</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>Clinical Knowledge System</div>
          </div>
        </div>

        {/* Concept search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f0f4f8', border: '0.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', flex: 1, maxWidth: '360px' }}>
          <svg width="13" height="13" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '13px', color: '#1a202c' }}
            placeholder={clinicalMode ? `Clinical mode — ${currentStage?.label}` : "Enter concept or symptom..."}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate(searchInput)}
            disabled={clinicalMode}
          />
          {loading && (
            <div style={{ width: '12px', height: '12px', border: '2px solid #185FA5', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          )}
        </div>

        {/* Map search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0f4f8', border: '0.5px solid #B5D4F4', borderRadius: '8px', padding: '5px 10px', maxWidth: '180px' }}>
          <svg width="12" height="12" fill="none" stroke="#378ADD" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          <input
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: '12px', color: '#1a202c', width: '120px' }}
            placeholder="Search nodes..."
            value={mapSearchTerm}
            onChange={e => setMapSearchTerm(e.target.value)}
          />
          {mapSearchTerm && (
            <button onClick={() => setMapSearchTerm('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', padding: 0 }}>×</button>
          )}
        </div>

        {/* Progress ring — only in clinical mode */}
        {clinicalMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#f0f4f8', border: '0.5px solid #e2e8f0', borderRadius: '8px', flexShrink: 0 }}>
            <svg width="32" height="32" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="11" fill="none" stroke="#E6F1FB" strokeWidth="3" />
              <circle cx="14" cy="14" r="11" fill="none" stroke="#185FA5" strokeWidth="3"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                transform="rotate(-90 14 14)"
              />
              <text x="14" y="18" textAnchor="middle" fontSize="8" fontWeight="500" fill="#185FA5">
                {stagesComplete}/{STAGES.length}
              </text>
            </svg>
            <div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Progress</div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#185FA5' }}>{progressPercent}%</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: clinicalMode ? '#E24B4A' : '#1D9E75' }} />
            <span style={{ fontSize: '11px', color: clinicalMode ? '#E24B4A' : '#1D9E75' }}>
              {clinicalMode ? 'Clinical mode' : 'Ready'}
            </span>
          </div>

          {/* Export */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(p => !p)}
              disabled={elements.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 10px', borderRadius: '8px',
                border: '0.5px solid #e2e8f0', background: '#fff',
                color: elements.length === 0 ? '#94a3b8' : '#334155',
                fontSize: '12px', cursor: elements.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '8px', minWidth: '170px', zIndex: 100, overflow: 'hidden' }}>
                {exportOptions.map(opt => (
                  <button key={opt.label} onClick={opt.action}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', background: 'none', border: 'none', borderBottom: '0.5px solid #f0f4f8', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 500, color: opt.color, width: '32px' }}>{opt.label}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{opt.sublabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button style={{ background: 'none', border: '0.5px solid #e2e8f0', borderRadius: '8px', color: '#64748b', cursor: 'pointer', padding: '5px 8px' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar */}
        <aside style={{ width: '192px', borderRight: '0.5px solid #e2e8f0', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', flexShrink: 0 }}>
          <div style={{ padding: '14px 0 8px' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 20px', marginBottom: '6px' }}>Workspace</div>
            {[
              { id: 'neural', label: 'Knowledge Map', icon: 'M13 10V3L4 14h7v7l9-11h-7z', active: true },
              { id: 'history', label: 'Session History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
              { id: 'trials', label: 'Clinical Trials', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
              { id: 'pubmed', label: 'PubMed Sync', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
            ].map(item => (
              <button key={item.id}
                onClick={() => { if (item.id === 'history') setIsHistoryOpen(true); if (item.id === 'neural') handleNewProject(); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', margin: '0 8px 2px', width: 'calc(100% - 16px)', border: 'none', background: item.active ? '#E6F1FB' : 'none', borderRadius: '8px', color: item.active ? '#185FA5' : '#64748b', cursor: 'pointer', textAlign: 'left' }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} /></svg>
                <span style={{ fontSize: '12px', fontWeight: item.active ? 500 : 400 }}>{item.label}</span>
              </button>
            ))}
          </div>

          <div style={{ borderTop: '0.5px solid #e2e8f0', margin: '8px 16px' }} />

          <div style={{ padding: '0 0 8px' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 20px', marginBottom: '8px' }}>Node legend</div>
            {[
              { color: '#E24B4A', bg: '#FCEBEB', label: 'Symptom' },
              { color: '#1D9E75', bg: '#EAF3DE', label: 'Treatment' },
              { color: '#185FA5', bg: '#E6F1FB', label: 'Mechanism' },
              { color: '#BA7517', bg: '#FAEEDA', label: 'Risk Factor' },
              { color: '#7F77DD', bg: '#EEEDFE', label: 'Diagnosis' },
            ].map(({ color, bg, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 20px', fontSize: '11px', color: '#64748b' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: bg, border: `1.5px solid ${color}`, flexShrink: 0 }} />
                {label}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '0.5px solid #e2e8f0', margin: '8px 16px' }} />

          <div style={{ padding: '0 0 8px' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 20px', marginBottom: '8px' }}>Evidence</div>
            <div style={{ padding: '3px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 500, background: '#E6F1FB', color: '#185FA5', padding: '2px 6px', borderRadius: '4px' }}>● PubMed</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Verified</span>
            </div>
            <div style={{ padding: '3px 20px', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 500, background: '#f0f4f8', color: '#64748b', padding: '2px 6px', borderRadius: '4px' }}>○ LLM</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Inferred</span>
            </div>
          </div>

          <div style={{ marginTop: 'auto', padding: '12px 20px', borderTop: '0.5px solid #e2e8f0', fontSize: '10px', color: '#94a3b8' }}>
            MedMind v1.0
          </div>
        </aside>

        {/* Main canvas */}
        <main style={{ flex: 1, position: 'relative', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Symptom banner */}
          {pendingSymptom && (
            <div style={{ background: '#EAF3DE', borderBottom: '1px solid #C0DD97', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#3B6D11' }}>
                  ⚕ "{pendingSymptom}" detected as a clinical symptom
                </div>
                <div style={{ fontSize: '11px', color: '#639922', marginTop: '2px' }}>Choose how to explore this concept</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={enterClinicalMode} style={{ background: '#0F6E56', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                  ⚕ Enter Clinical Reasoning Mode
                </button>
                <button onClick={enterNormalMode} style={{ background: '#fff', color: '#3B6D11', border: '1px solid #C0DD97', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' }}>
                  Continue as Knowledge Map
                </button>
              </div>
            </div>
          )}

          {/* Clinical stage bar */}
          {clinicalMode && (
            <div style={{ background: '#fff', borderBottom: '0.5px solid #e2e8f0', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button onClick={handleGoBackStage} disabled={currentStageIndex === 0}
                style={{ background: 'none', border: '0.5px solid #e2e8f0', borderRadius: '6px', color: currentStageIndex === 0 ? '#d1d5db' : '#64748b', padding: '4px 8px', fontSize: '11px', cursor: currentStageIndex === 0 ? 'not-allowed' : 'pointer', marginRight: '4px' }}>
                ← Back
              </button>
              {STAGES.map((stage, idx) => {
                const isActive = idx === currentStageIndex;
                const isDone = idx < currentStageIndex;
                const isLocked = idx > currentStageIndex;
                return (
                  <React.Fragment key={stage.id}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 500,
                      border: '0.5px solid',
                      backgroundColor: isActive ? `${stage.color}15` : isDone ? '#EAF3DE' : '#f8fafc',
                      borderColor: isActive ? stage.color : isDone ? '#C0DD97' : '#e2e8f0',
                      color: isActive ? stage.color : isDone ? '#3B6D11' : '#94a3b8',
                      opacity: isLocked ? 0.6 : 1, transition: 'all 0.2s'
                    }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isDone ? '#1D9E75' : isActive ? stage.color : '#d1d5db' }} />
                      {stage.label}
                    </div>
                    {idx < STAGES.length - 1 && <div style={{ width: '14px', height: '1px', background: idx < currentStageIndex ? '#C0DD97' : '#e2e8f0', flexShrink: 0 }} />}
                  </React.Fragment>
                );
              })}
              <button onClick={handleAdvanceStage} disabled={!canAdvance}
                style={{ marginLeft: 'auto', background: canAdvance ? '#0F6E56' : '#f0f4f8', color: canAdvance ? '#fff' : '#94a3b8', border: 'none', borderRadius: '8px', padding: '5px 12px', fontSize: '11px', fontWeight: 500, cursor: canAdvance ? 'pointer' : 'not-allowed', transition: 'all 0.2s', flexShrink: 0 }}>
                {currentStageIndex < STAGES.length - 1 ? `Next: ${STAGES[currentStageIndex + 1]?.label} →` : 'Complete ✓'}
              </button>
            </div>
          )}

          <div style={{ flex: 1, position: 'relative' }}>
            <MindMap
              ref={mindMapRef}
              elements={finalElements}
              onExploreNode={(label, ancestors) => handleGenerate(label, ancestors)}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={(label, ancestors) => handleGenerate(label, ancestors)}
              onAcceptSuggestion={handleAcceptSuggestion}
              onDismissSuggestion={handleDismissSuggestion}
              searchTerm={mapSearchTerm}
            />
          </div>

          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248,250,252,0.7)', pointerEvents: 'none' }}>
              <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '12px', padding: '20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #E6F1FB', borderTopColor: '#185FA5', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {clinicalMode ? `Generating ${currentStage?.label}...` : 'Analyzing literature...'}
                </span>
              </div>
            </div>
          )}
        </main>

        <Sidebar data={selectedNode} onClose={() => setSelectedNode(null)} key={selectedNode?.id} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default App;