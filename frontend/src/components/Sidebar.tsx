import React from 'react';
import axios from 'axios';

interface Evidence {
  title: string;
  pubid: string;
}

interface SidebarProps {
  evidence: Evidence[];
}

const Sidebar: React.FC<SidebarProps> = ({ evidence }) => {
  // Function to fetch the full abstract from the backend
  const handleFetchFullText = async (pubid: string) => {
    try {
      const res = await axios.post("http://127.0.0.1:8000/fetch-full-evidence", { pubid });
      if (res.data.full_content) {
        alert(`PubMed Abstract (ID: ${pubid}):\n\n${res.data.full_content}`);
      } else {
        alert("Full content not found.");
      }
    } catch (err) {
      console.error("Error fetching full text:", err);
      alert("Failed to retrieve data from PubMed.");
    }
  };

  // If no evidence is selected, the sidebar remains hidden
  if (!evidence || evidence.length === 0) return null;

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col h-full animate-in slide-in-from-right duration-300">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <h2 className="text-xl font-bold text-green-400 flex items-center gap-2">
          <span className="text-sm">🔬</span> Medical Evidence
        </h2>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
          RAG Analysis Results
        </p>
      </div>

      {/* Evidence List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {evidence.map((item, index) => (
          <div 
            key={index} 
            onClick={() => handleFetchFullText(item.pubid)}
            className="group p-4 bg-gray-800/50 rounded-xl border border-gray-700 hover:border-green-500/50 hover:bg-gray-800 transition-all cursor-pointer shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-mono text-gray-500 bg-black px-2 py-0.5 rounded">
                SOURCE #{index + 1}
              </span>
              <span className="text-blue-400 text-xs font-semibold group-hover:underline">
                View Abstract
              </span>
            </div>
            
            <h3 className="text-sm font-medium text-gray-200 leading-snug mb-3">
              {item.title}
            </h3>
            
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-500 font-mono">PMID: {item.pubid}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/80">
        <p className="text-[10px] text-gray-600 italic leading-tight">
          Double-click a node to expand the knowledge graph based on these references.
        </p>
      </div>
    </div>
  );
};

export default Sidebar;