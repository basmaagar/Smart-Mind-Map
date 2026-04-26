import React, { useState } from 'react';
import axios from 'axios';
import MindMap from './components/MindMap';
import Sidebar from './components/Sidebar';
import ProjectMenu from './components/ProjectMenu';

const API_BASE = "http://127.0.0.1:8000";

interface Suggestion {
  name: string;
  evidence: any;
  parent: string;
}

const App: React.FC = () => {
  const [elements, setElements] = useState<any[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<Suggestion[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string, label: string, evidence: any[] } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const fetchGraph = async (projectId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/projects/${projectId}`);
      setElements([...res.data]);
      setCurrentProjectId(projectId);
    } catch (err) {
      console.error("Error fetching graph:", err);
    }
  };

  const handleGenerate = async (concept: string) => {
    if (!concept.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest`, {
        concept: concept,
        project_id: currentProjectId
      });

      const { project_id, parent, suggestions } = res.data;
      if (!currentProjectId) setCurrentProjectId(project_id);
      await fetchGraph(project_id);
      
      const newSuggestions = suggestions.map((s: any) => ({
        ...s,
        evidence: typeof s.evidence === 'string' ? JSON.parse(s.evidence) : s.evidence,
        parent: parent
      }));
      setPendingSuggestions(prev => [...prev, ...newSuggestions]);
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
      if (typeof evField === 'string') {
        parsed = JSON.parse(evField);
      } else if (Array.isArray(evField)) {
        parsed = evField;
      }
      setSelectedNode({
        id: nodeData.id,
        label: nodeData.label,
        evidence: parsed
      });
    } catch (e) {
      console.error("Error in onNodeClick:", e);
      setSelectedNode({ id: nodeData.id, label: nodeData.label, evidence: [] });
    }
  };

  const handleNewProject = () => {
    setElements([]);
    setPendingSuggestions([]);
    setCurrentProjectId(null);
    setSelectedNode(null);
    setSearchInput("");
  };

  const truncate = (str: string, n: number) => {
    return (str.length > n) ? str.slice(0, n-1) + '...' : str;
  };

  const allElements = [
    ...elements.map(el => ({
      ...el,
      data: {
        ...el.data,
        label: truncate(el.data.label || "", 60) // Increased limit for wider rectangles
      }
    })),
    ...pendingSuggestions.map(sug => ({
      group: 'nodes',
      classes: 'suggestion',
      data: { 
        id: `sug-${sug.name.toLowerCase().trim()}`, 
        label: truncate(sug.name, 60), 
        isSuggestion: true, 
        evidence: sug.evidence, 
        parentId: sug.parent,
        suggestionObj: sug
      }
    })),
    ...pendingSuggestions.map(sug => {
      const targetId = `sug-${sug.name.toLowerCase().trim()}`;
      // Check if target suggestion has evidence (though suggestions usually don't have evidence until accepted)
      const hasEvidence = sug.evidence && sug.evidence.length > 0;
      
      return {
        group: 'edges',
        classes: 'suggestion-edge',
        data: { 
          id: `edge-sug-${sug.parent.toLowerCase().trim()}-${sug.name.toLowerCase().trim()}`, 
          source: sug.parent.toLowerCase().trim(), 
          target: targetId,
          isValidated: hasEvidence
        }
      };
    })
  ];

  // We also need to mark existing edges as validated if the target node has evidence
  const finalElements = allElements.map(el => {
    if (el.group === 'edges') {
      const targetNode = allElements.find(node => node.group === 'nodes' && node.data.id === el.data.target);
      if (targetNode && targetNode.data.evidence && targetNode.data.evidence.length > 0) {
        return { ...el, data: { ...el.data, isValidated: true } };
      }
    }
    return el;
  });

  return (
    <div className="app-container" style={{ backgroundColor: 'black', color: 'white', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Project Menu Overlay */}
      <ProjectMenu 
        isOpen={isHistoryOpen} 
        setIsOpen={setIsHistoryOpen} 
        onSelectProject={fetchGraph}
        onNewProject={handleNewProject}
      />

      {/* Top Status Bar */}
      <header style={{ height: '56px', borderBottom: '1px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', backgroundColor: 'black', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.2em', color: '#007fff', margin: 0, textTransform: 'uppercase' }}>MEDMIND OS (KERNEL V1.0)</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00ff00', boxShadow: '0 0 8px #00ff00' }} />
            <span style={{ fontSize: '9px', fontWeight: 'bold', color: 'rgba(0, 255, 0, 0.8)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>System Live</span>
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: '600px', padding: '0 48px' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#050505', border: '1px solid #111', padding: '6px 16px', borderRadius: '2px' }}>
              <svg width="12" height="12" style={{ color: '#007fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              <input 
                style={{ flex: 1, backgroundColor: 'transparent', border: 'none', color: 'white', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase', outline: 'none' }}
                placeholder="Initialize Command..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate(searchInput)}
              />
              {loading && <div style={{ width: '12px', height: '12px', border: '2px solid #007fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
           <button style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer' }}>
             <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
           </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Nav persistent */}
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
                 style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', border: 'none', background: item.active ? 'rgba(0, 127, 255, 0.05)' : 'none', borderLeft: item.active ? '2px solid #007fff' : 'none', color: item.active ? '#007fff' : '#333', cursor: 'pointer', textAlign: 'left' }}
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

        {/* Main Graph Area */}
        <main style={{ flex: 1, position: 'relative', backgroundColor: 'black', backgroundImage: 'radial-gradient(circle, #111 1px, transparent 1px)', backgroundSize: '30px 30px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <MindMap 
              elements={finalElements} 
              onExploreNode={handleGenerate}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={handleGenerate}
              onAcceptSuggestion={handleAcceptSuggestion}
              onDismissSuggestion={handleDismissSuggestion}
            />
          </div>
          
          {/* Legend Overlay */}
          <div style={{ position: 'absolute', bottom: '24px', left: '24px', padding: '16px', border: '1px solid #111', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 20 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '6px', height: '6px', backgroundColor: '#ffffff' }} />
                <span style={{ fontSize: '7px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Validated Pathway</span>
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '6px', height: '6px', backgroundColor: '#00ff00' }} />
                <span style={{ fontSize: '7px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Evidence Verified</span>
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '6px', height: '6px', backgroundColor: '#222' }} />
                <span style={{ fontSize: '7px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Null Inference</span>
             </div>
          </div>
        </main>

        {/* Right Intelligence Sidebar */}
        <Sidebar 
          data={selectedNode} 
          onClose={() => setSelectedNode(null)} 
          key={selectedNode?.id}
        />
      </div>
    </div>
  );
};

export default App;