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
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: 60, backdropFilter: 'blur(4px)' }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        height: '100%', 
        width: '320px', 
        zIndex: 70, 
        backgroundColor: 'black', 
        borderRight: '1px solid #111',
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{ padding: '24px', borderBottom: '1px solid #111', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#050505' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '12px', fontWeight: 'bold', color: '#007fff', textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>Terminal_History</h2>
              <span style={{ fontSize: '8px', color: '#333', textTransform: 'uppercase', fontWeight: 'bold', marginTop: '4px' }}>Session_Logs_Local</span>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
            >
              [CLOSE]
            </button>
          </div>

          {/* Action Button */}
          <div style={{ padding: '24px' }}>
            <button 
              onClick={() => {
                onNewProject();
                setIsOpen(false);
              }}
              style={{ 
                width: '100%', 
                backgroundColor: 'black', 
                color: '#00ff00', 
                border: '1px solid #00ff00', 
                padding: '12px', 
                fontSize: '10px', 
                fontWeight: 'bold', 
                textTransform: 'uppercase', 
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#00ff00';
                e.currentTarget.style.color = 'black';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'black';
                e.currentTarget.style.color = '#00ff00';
              }}
            >
              + Initiate_New_Sequence
            </button>
          </div>

          {/* History List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
            <h3 style={{ fontSize: '9px', fontWeight: 'bold', color: '#222', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '16px' }}>
              Stored_Sequences
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {projects.length > 0 ? (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      setIsOpen(false);
                    }}
                    style={{ 
                      width: '100%', 
                      textAlign: 'left', 
                      padding: '12px', 
                      backgroundColor: '#050505', 
                      color: '#444', 
                      border: '1px solid #111', 
                      fontSize: '10px', 
                      fontWeight: 'bold', 
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#007fff';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#111';
                      e.currentTarget.style.color = '#444';
                    }}
                  >
                    {p.title || "Untitled_Sequence"}
                  </button>
                ))
              ) : (
                <div style={{ padding: '40px 0', textAlign: 'center', opacity: 0.3 }}>
                   <p style={{ fontSize: '10px', fontStyle: 'italic', color: '#333' }}>No_History_Found</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer Info */}
          <div style={{ padding: '24px', borderTop: '1px solid #111', backgroundColor: 'black' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#222', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              <span>Logs_v1.0</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#00ff00' }} />
                Kernel_Ready
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectMenu;