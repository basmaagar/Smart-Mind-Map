import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Project {
  id: string;
  title: string;
}

interface ProjectMenuProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
}

const ProjectMenu: React.FC<ProjectMenuProps> = ({ 
  isOpen, 
  setIsOpen, 
  onSelectProject, 
  onNewProject 
}) => {
  const [projects, setProjects] = useState<Project[]>([]);

  // Fetch projects when the menu opens
  useEffect(() => {
    if (isOpen) {
      axios.get("http://127.0.0.1:8000/projects")
        .then(res => setProjects(res.data))
        .catch(err => console.error("Failed to load projects:", err));
    }
  }, [isOpen]);

  return (
    <>
      {/* Dark Overlay when menu is open */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <div className={`fixed top-0 left-0 h-full bg-gray-900 w-72 z-50 transform transition-transform duration-300 ease-in-out border-r border-gray-800 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-800 flex justify-between items-center">
            <h2 className="text-xl font-bold text-blue-400">MedMind OS</h2>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-2xl">✕</span>
            </button>
          </div>

          {/* Action Button */}
          <div className="p-6">
            <button 
              onClick={() => {
                onNewProject();
                setIsOpen(false);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              <span>+</span> New Exploration
            </button>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4 px-2">
              Exploration History
            </h3>
            
            <div className="space-y-1">
              {projects.length > 0 ? (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      setIsOpen(false);
                    }}
                    className="w-full text-left p-3 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-all truncate border border-transparent hover:border-gray-700"
                  >
                    {p.title}
                  </button>
                ))
              ) : (
                <p className="text-xs text-gray-600 italic px-2">No projects found.</p>
              )}
            </div>
          </div>

          {/* Footer Info */}
          <div className="p-4 border-t border-gray-800">
            <p className="text-[10px] text-gray-600 text-center uppercase tracking-tighter">
              Kernel v1.0.4 - Medical Research OS
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectMenu;