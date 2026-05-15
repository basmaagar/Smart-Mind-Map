import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SavedArticle {
  pubid: string;
  title: string;
  saved_at: string;
}

interface PubMedSyncProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  refreshTrigger: number;
}

const PubMedSync: React.FC<PubMedSyncProps> = ({ isOpen, setIsOpen, refreshTrigger }) => {
  const [articles, setArticles] = useState<SavedArticle[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchArticles = () => {
    axios.get("http://127.0.0.1:8000/saved-articles")
      .then(res => setArticles(res.data))
      .catch(err => console.error("Failed to load saved articles:", err));
  };

  useEffect(() => {
    if (isOpen) fetchArticles();
  }, [isOpen]);

  // Refresh when a new article is saved from the sidebar
  useEffect(() => {
    if (isOpen && refreshTrigger > 0) fetchArticles();
  }, [refreshTrigger]);

  const handleDelete = async (pubid: string) => {
    setDeletingId(pubid);
    try {
      await axios.delete(`http://127.0.0.1:8000/saved-articles/${pubid}`);
      setArticles(prev => prev.filter(a => a.pubid !== pubid));
    } catch (err) {
      console.error("Failed to delete article:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return '';
    }
  };

  return (
    <>
      {isOpen && (
        <div
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(15,23,42,0.4)',
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
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '0.5px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '13px', fontWeight: 500, color: '#1a202c', margin: 0 }}>
              PubMed Sync
            </h2>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {articles.length} saved article{articles.length !== 1 ? 's' : ''}
            </span>
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

        {/* Article list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {articles.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {articles.map(article => (
                <div key={article.pubid} style={{
                  background: '#f8fafc',
                  border: '0.5px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px'
                }}>
                  {/* PubMed tag — same style as Sidebar evidence cards */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', color: '#185FA5', background: '#E6F1FB',
                    padding: '2px 6px', borderRadius: '4px', marginBottom: '6px'
                  }}>
                    <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PubMed · Verified
                  </div>

                  {/* Title */}
                  <div style={{
                    fontSize: '11px', fontWeight: 500, color: '#1a202c',
                    lineHeight: '1.4', marginBottom: '6px'
                  }}>
                    {article.title || 'Research Publication'}
                  </div>

                  {/* Footer */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', paddingTop: '6px',
                    borderTop: '0.5px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        PMID: {article.pubid}
                      </span>
                      {article.saved_at && (
                        <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                          Saved {formatDate(article.saved_at)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pubid}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '10px', color: '#185FA5', textDecoration: 'none' }}
                      >
                        View ↗
                      </a>
                      <button
                        onClick={() => handleDelete(article.pubid)}
                        disabled={deletingId === article.pubid}
                        title="Remove from library"
                        style={{
                          background: 'none', border: 'none',
                          cursor: 'pointer', padding: '2px',
                          color: '#cbd5e1', transition: 'color 0.15s',
                          fontSize: '14px', lineHeight: 1
                        }}
                        onMouseEnter={e =>
                          (e.currentTarget as HTMLButtonElement).style.color = '#A32D2D'
                        }
                        onMouseLeave={e =>
                          (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1'
                        }
                      >
                        {deletingId === article.pubid ? '...' : '×'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', opacity: 0.4, paddingTop: '60px'
            }}>
              <svg width="32" height="32" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                  d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
              </svg>
              <span style={{
                fontSize: '11px', color: '#94a3b8',
                marginTop: '8px', textAlign: 'center', lineHeight: 1.5
              }}>
                No saved articles yet.<br />
                Bookmark articles from the evidence panel.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '0.5px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between',
          fontSize: '10px', color: '#94a3b8'
        }}>
          <span>Global library · All projects</span>
          <span style={{ color: '#1D9E75' }}>● {articles.length} saved</span>
        </div>
      </div>
    </>
  );
};

export default PubMedSync;