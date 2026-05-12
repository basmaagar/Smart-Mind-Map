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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProjects = () => {
    axios.get("http://127.0.0.1:8000/projects")
      .then(res => setProjects(res.data))
      .catch(err => console.error("Failed to load projects:", err));
  };

  useEffect(() => {
    if (isOpen) fetchProjects();
  }, [isOpen]);

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation(); // prevent selecting the project when clicking delete
    if (!window.confirm("Delete this map? This cannot be undone.")) return;
    setDeletingId(projectId);
    try {
      await axios.delete(`http://127.0.0.1:8000/projects/${projectId}`);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      console.error("Failed to delete project:", err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            zIndex: 60, backdropFilter: 'blur(4px)'
          }}
          onClick={() => setIsOpen(false)}
        />
      )}

      <div style={{
        position: 'fixed', top: 0, left: 0, height: '100%', width: '300px',
        zIndex: 70, backgroundColor: '#ffffff',
        borderRight: '0.5px solid #e2e8f0',
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '0.5px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '13px', fontWeight: 500, color: '#1a202c', margin: 0 }}>Session History</h2>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Saved knowledge maps</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none', border: '0.5px solid #e2e8f0',
              borderRadius: '6px', color: '#64748b', cursor: 'pointer',
              padding: '4px 8px', fontSize: '11px'
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
          <button
            onClick={() => { onNewProject(); setIsOpen(false); }}
            style={{
              width: '100%', backgroundColor: '#185FA5', color: '#fff',
              border: 'none', borderRadius: '8px', padding: '10px',
              fontSize: '12px', fontWeight: 500, cursor: 'pointer'
            }}
          >
            + New Knowledge Map
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{
            fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '8px', paddingLeft: '4px'
          }}>
            Saved maps
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {projects.length > 0 ? (
              projects.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    backgroundColor: '#f8fafc',
                    border: '0.5px solid #e2e8f0', borderRadius: '8px',
                    transition: 'all 0.15s', overflow: 'hidden'
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#B5D4F4';
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = '#E6F1FB';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f8fafc';
                  }}
                >
                  {/* Select button */}
                  <button
                    onClick={() => { onSelectProject(p.id); setIsOpen(false); }}
                    style={{
                      flex: 1, textAlign: 'left', padding: '10px 12px',
                      background: 'none', border: 'none',
                      color: '#334155', fontSize: '12px', fontWeight: 500,
                      cursor: 'pointer', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                  >
                    {p.title || 'Untitled Map'}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={e => handleDelete(e, p.id)}
                    disabled={deletingId === p.id}
                    title="Delete map"
                    style={{
                      flexShrink: 0, width: '32px', height: '32px',
                      margin: '4px', background: 'none',
                      border: '0.5px solid transparent', borderRadius: '6px',
                      color: deletingId === p.id ? '#94a3b8' : '#cbd5e1',
                      cursor: deletingId === p.id ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s', fontSize: '14px'
                    }}
                    onMouseEnter={e => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FCEBEB';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#F09595';
                      (e.currentTarget as HTMLButtonElement).style.color = '#A32D2D';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1';
                    }}
                  >
                    {deletingId === p.id ? '...' : '×'}
                  </button>
                </div>
              ))
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>No saved maps yet</p>
              </div>
            )}
          </div>
        </div>

        <div style={{
          padding: '12px 20px', borderTop: '0.5px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between',
          fontSize: '10px', color: '#94a3b8'
        }}>
          <span>MedMind v1.0</span>
          <span style={{ color: '#1D9E75' }}>● System ready</span>
        </div>
      </div>
    </>
  );
};

export default ProjectMenu;