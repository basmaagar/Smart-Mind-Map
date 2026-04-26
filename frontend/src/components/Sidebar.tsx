import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface SidebarProps {
  data: { label: string, evidence: any[] } | null;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ data, onClose }) => {
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

  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Calculate new width from the right edge
      const newWidth = document.body.clientWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  console.log("Sidebar rendering with data:", data);

  // If no node is selected, the sidebar remains hidden
  if (!data) return null;

  return (
    <div 
      style={{ width: `${width}px` }}
      className="fixed top-0 right-0 h-full bg-gray-900 border-l-4 border-red-600 flex flex-col z-[9999] shadow-[0_0_50px_rgba(0,0,0,0.8)]"
    >
      {/* Resizer Handle */}
      <div 
        onMouseDown={() => setIsResizing(true)}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 z-50 transition-colors"
        title="Drag to resize"
      />

      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-green-400 flex items-center gap-2">
            <span className="text-sm">🔬</span> Medical Evidence
          </h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
            {data.label}
          </p>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-500 hover:text-white p-1 rounded-md hover:bg-gray-800 transition-colors"
          title="Close Sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      {/* Evidence List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {data.evidence && data.evidence.length > 0 ? (
          data.evidence.map((item, index) => (
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
          ))
        ) : (
          <div className="text-gray-500 text-sm italic text-center mt-10">
            No specific sources linked to this node.
          </div>
        )}
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