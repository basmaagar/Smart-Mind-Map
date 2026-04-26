import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MindMap from './components/MindMap';
import Sidebar from './components/Sidebar';
import ProjectMenu from './components/ProjectMenu';

const API_BASE = "http://127.0.0.1:8000";

interface Evidence {
  title: string;
  pubid: string;
}

const App: React.FC = () => {
  const [elements, setElements] = useState<any[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);

  // 1. Fetch the graph and update the local state
  const fetchGraph = async (projectId: string) => {
    try {
      const res = await axios.get(`${API_BASE}/projects/${projectId}`);
      // Forcer une nouvelle référence pour que Cytoscape se mette à jour
      setElements([...res.data]);
      setCurrentProjectId(projectId);
    } catch (err) {
      console.error("Error fetching graph:", err);
    }
  };

  // 2. Handle concept generation (Initial or Recursive)
  const handleGenerate = async (concept: string) => {
    if (!concept.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/suggest`, {
        concept: concept,
        project_id: currentProjectId // Sends null if it's a new project
      });

      const { project_id } = res.data;
      
      // Update project ID and refresh the visual graph
      if (!currentProjectId) setCurrentProjectId(project_id);
      await fetchGraph(project_id);
      
      setSearchInput(""); // Clear input after generation
    } catch (err) {
      console.error("Generation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // 3. Reset the UI for a completely new project
  const handleNewProject = () => {
    setElements([]);
    setCurrentProjectId(null);
    setSelectedEvidence([]);
    setSearchInput("");
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden font-sans">
      {/* LEFT: Burger Menu (Project history & New Project button) */}
      <ProjectMenu 
        isOpen={isMenuOpen} 
        setIsOpen={setIsMenuOpen} 
        onSelectProject={fetchGraph}
        onNewProject={handleNewProject}
      />

      {/* MIDDLE: Main Exploration Area */}
      <main className="flex-1 flex flex-col relative min-w-0">
        <header className="p-4 border-b border-gray-800 flex items-center gap-4 bg-black/50 backdrop-blur-md z-10">
          <button 
            onClick={() => setIsMenuOpen(true)} 
            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
            title="Open Projects"
          >
            <span className="text-2xl">☰</span>
          </button>
          
          <div className="flex-1 max-w-2xl flex gap-2">
            <input 
              className="flex-1 bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 transition-all"
              placeholder="Enter medical concept (e.g., Pharmacokinetics)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate(searchInput)}
            />
            <button 
              onClick={() => handleGenerate(searchInput)}
              disabled={loading || !searchInput.trim()}
              className={`px-6 py-2 rounded-lg font-bold transition-all ${
                loading ? 'bg-gray-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? "..." : "Explore"}
            </button>
          </div>
        </header>
        
        {/* Cytoscape Canvas */}
        <div className="flex-1 relative">
          {elements.length > 0 ? (
            <MindMap 
              elements={elements} 
              onNodeClick={(evidence) => setSelectedEvidence(evidence)} // Simple click = Show sources
              onNodeDoubleClick={(label) => handleGenerate(label)} // Double click = Recursivity
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 italic">
              Use the search bar above to start your medical exploration.
            </div>
          )}
        </div>
      </main>

      {/* RIGHT: Evidence/Sources Panel */}
      {/* Only visible if a node with evidence is selected */}
      <Sidebar evidence={selectedEvidence} />
    </div>
  );
};

export default App;