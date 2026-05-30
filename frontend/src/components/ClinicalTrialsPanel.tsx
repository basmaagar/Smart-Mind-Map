import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Trial {
  nct_id: string;
  title: string;
  status: string;
  phase: string;
  sponsor: string;
  url: string;
}

interface ClinicalTrialsPanelProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  concept: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  RECRUITING:           { bg: '#D4EDBB', color: '#3B6D11', border: '#C0DD97' },
  COMPLETED:            { bg: '#E6F1FB', color: '#185FA5', border: '#B5D4F4' },
  ACTIVE_NOT_RECRUITING:{ bg: '#FAEEDA', color: '#854F0B', border: '#FAC775' },
  TERMINATED:           { bg: '#FCEBEB', color: '#A32D2D', border: '#F09595' },
  NOT_YET_RECRUITING:   { bg: '#f0f4f8', color: '#64748b', border: '#e2e8f0' },
};

const getStatusStyle = (status: string) =>
  STATUS_COLORS[status] || { bg: '#f0f4f8', color: '#64748b', border: '#e2e8f0' };

const ClinicalTrialsPanel: React.FC<ClinicalTrialsPanelProps> = ({
  isOpen, setIsOpen, concept
}) => {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen || !concept) return;
    setLoading(true);
    axios.get(`http://127.0.0.1:8000/clinical-trials/${encodeURIComponent(concept)}`)
      .then(res => setTrials(res.data.trials || []))
      .catch(err => console.error("Failed to load trials:", err))
      .finally(() => setLoading(false));
  }, [isOpen, concept]);

  const filtered = trials.filter(t =>
    !searchTerm ||
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.nct_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        position: 'fixed', top: 0, left: 0, height: '100%', width: '340px',
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
              Clinical Trials
            </h2>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {concept ? `Results for "${concept}"` : 'No concept selected'}
              {!loading && trials.length > 0 && ` · ${trials.length} trials`}
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

        {/* Search */}
        {trials.length > 3 && (
          <div style={{ padding: '10px 16px', borderBottom: '0.5px solid #e2e8f0' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: '#f8fafc', border: '0.5px solid #e2e8f0',
              borderRadius: '6px', padding: '5px 10px'
            }}>
              <svg width="12" height="12" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: '12px', color: '#1a202c', flex: 1 }}
                placeholder="Filter trials..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Trial list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}>
              <div style={{
                width: '24px', height: '24px',
                border: '2px solid #E6F1FB', borderTopColor: '#185FA5',
                borderRadius: '50%', animation: 'spin 1s linear infinite'
              }} />
            </div>
          ) : filtered.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map(trial => {
                const statusStyle = getStatusStyle(trial.status);
                return (
                  <div key={trial.nct_id} style={{
                    background: '#f8fafc', border: '0.5px solid #e2e8f0',
                    borderRadius: '8px', padding: '10px'
                  }}>
                    {/* ClinicalTrials tag */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '10px', color: '#3B6D11', background: '#D4EDBB',
                      padding: '2px 6px', borderRadius: '4px', marginBottom: '6px'
                    }}>
                      <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      ClinicalTrials.gov
                    </div>

                    {/* Title */}
                    <div style={{
                      fontSize: '11px', fontWeight: 500, color: '#1a202c',
                      lineHeight: 1.4, marginBottom: '6px'
                    }}>
                      {trial.title}
                    </div>

                    {/* Badges */}
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      gap: '5px', flexWrap: 'wrap', marginBottom: '6px'
                    }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 500,
                        background: statusStyle.bg, color: statusStyle.color,
                        padding: '2px 6px', borderRadius: '3px',
                        border: `0.5px solid ${statusStyle.border}`
                      }}>{trial.status.replace(/_/g, ' ')}</span>
                      {trial.phase && trial.phase !== 'N/A' && (
                        <span style={{
                          fontSize: '9px', color: '#64748b',
                          background: '#f0f4f8', padding: '2px 5px',
                          borderRadius: '3px', border: '0.5px solid #e2e8f0'
                        }}>{trial.phase}</span>
                      )}
                    </div>

                    {/* Sponsor */}
                    {trial.sponsor && (
                      <div style={{
                        fontSize: '10px', color: '#64748b',
                        marginBottom: '6px'
                      }}>{trial.sponsor}</div>
                    )}

                    {/* Footer */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', paddingTop: '6px',
                      borderTop: '0.5px solid #e2e8f0'
                    }}>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>{trial.nct_id}</span>
                      <a
                        href={trial.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '10px', color: '#185FA5', textDecoration: 'none' }}
                      >View ↗</a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', opacity: 0.4, paddingTop: '60px'
            }}>
              <svg width="32" height="32" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span style={{
                fontSize: '11px', color: '#94a3b8',
                marginTop: '8px', textAlign: 'center', lineHeight: 1.5
              }}>
                {concept ? 'No trials found for this concept.' : 'Open a knowledge map first.'}
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
          <span>ClinicalTrials.gov · NIH</span>
          <span style={{ color: '#1D9E75' }}>● Live data</span>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
};

export default ClinicalTrialsPanel;