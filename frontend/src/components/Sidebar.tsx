import React, { useState } from 'react';
import axios from 'axios';

interface SidebarProps {
  data: { label: string; evidence: any[] } | null;
  onClose: () => void;
  onArticleSaved?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ data, onClose, onArticleSaved }) => {
  const [savedPubids, setSavedPubids] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleSaveArticle = async (pubid: string, title: string) => {
    setSavingId(pubid);
    try {
      await axios.post("http://127.0.0.1:8000/saved-articles", { pubid, title });
      setSavedPubids(prev => new Set(prev).add(pubid));
      onArticleSaved?.();
    } catch (err) {
      console.error("Failed to save article:", err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <aside style={{
      width: '220px',
      borderLeft: '0.5px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      flexShrink: 0
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '0.5px solid #e2e8f0',
        backgroundColor: '#ffffff'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: '2px'
        }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#1a202c' }}>
            Evidence Panel
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#1D9E75' }} />
            <span style={{ fontSize: '10px', color: '#1D9E75' }}>Live</span>
          </div>
        </div>
        <div style={{
          fontSize: '11px', color: '#64748b',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {data?.label || 'Select a node'}
        </div>
      </div>

      {/* Evidence Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {data ? (
          data.evidence && data.evidence.length > 0 ? (
            data.evidence.map((item, idx) => (
              <div key={idx} style={{
                marginBottom: '8px',
                background: '#f8fafc',
                border: '0.5px solid #e2e8f0',
                borderRadius: '8px',
                padding: '9px'
              }}>
                {/* PubMed tag */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', color: '#185FA5', background: '#E6F1FB',
                  padding: '2px 6px', borderRadius: '4px', marginBottom: '5px'
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
                  {item.title || 'Research Publication'}
                </div>

                {/* Footer — PMID + View + Save */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', paddingTop: '6px',
                  borderTop: '0.5px solid #e2e8f0'
                }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    PMID: {item.pubid}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${item.pubid}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: '#185FA5', textDecoration: 'none' }}
                    >
                      View ↗
                    </a>

                    {/* Bookmark / Save button */}
                    <button
                      onClick={() => handleSaveArticle(item.pubid, item.title)}
                      disabled={savedPubids.has(item.pubid) || savingId === item.pubid}
                      title={savedPubids.has(item.pubid) ? 'Saved' : 'Save to PubMed Sync'}
                      style={{
                        background: 'none', border: 'none', cursor: savedPubids.has(item.pubid) ? 'default' : 'pointer',
                        padding: '2px', display: 'flex', alignItems: 'center',
                        color: savedPubids.has(item.pubid) ? '#1D9E75' : '#94a3b8',
                        transition: 'color 0.15s'
                      }}
                      onMouseEnter={e => {
                        if (!savedPubids.has(item.pubid))
                          (e.currentTarget as HTMLButtonElement).style.color = '#185FA5';
                      }}
                      onMouseLeave={e => {
                        if (!savedPubids.has(item.pubid))
                          (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
                      }}
                    >
                      {savingId === item.pubid ? (
                        <span style={{ fontSize: '9px', color: '#94a3b8' }}>...</span>
                      ) : savedPubids.has(item.pubid) ? (
                        // Filled bookmark — saved
                        <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
                        </svg>
                      ) : (
                        // Empty bookmark — not saved
                        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{
              marginTop: '8px', background: '#f8fafc',
              border: '0.5px solid #e2e8f0', borderRadius: '8px', padding: '9px'
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '10px', color: '#64748b', background: '#f0f4f8',
                padding: '2px 6px', borderRadius: '4px', marginBottom: '5px'
              }}>
                ○ LLM · Inferred
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>
                No PubMed sources linked. Generated from LLM medical knowledge.
              </div>
            </div>
          )
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', opacity: 0.4, paddingTop: '40px'
          }}>
            <svg width="32" height="32" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', textAlign: 'center' }}>
              Select a node to view evidence
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 14px', borderTop: '0.5px solid #e2e8f0',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>RAG Engine · PubMed Index</div>
        <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>
          ● 36M+ articles indexed
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;