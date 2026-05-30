import React, { useState } from 'react';
import axios from 'axios';

interface EvidenceItem {
  source?: string;
  // PubMed fields
  pubid?: string;
  title?: string;
  // BioPortal fields
  ontology_id?: string;
  ontology_name?: string;
  semantic_type?: string;
  definition?: string;
  concept_uri?: string;
  synonyms?: string[];
  // ClinicalTrials fields
  trials?: {
    nct_id: string;
    title: string;
    status: string;
    phase: string;
    sponsor: string;
    url: string;
  }[];
}

interface SidebarProps {
  data: {
    label: string;
    evidence: any[];
    ontology_evidence?: { // Explicitly type ontology_evidence
      ontology_id: string;
      ontology_name: string;
      semantic_type: string;
      definition: string;
      concept_uri: string;
      synonyms: string[];
    } | null;
  } | null;
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

  const pubmedItems: EvidenceItem[] = (data?.evidence || []).filter(
    e => !e.source || e.source === "pubmed"
  );
  const bioportalItem: EvidenceItem | null =
    (data?.evidence || []).find(e => e.source === "bioportal") || null;
  const ctItem: EvidenceItem | null =
    (data?.evidence || []).find(e => e.source === "clinicaltrials") || null;


  return (
    <aside style={{
      width: '220px', borderLeft: '0.5px solid #e2e8f0',
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#ffffff', overflow: 'hidden', flexShrink: 0
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', borderBottom: '0.5px solid #e2e8f0'
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {data ? (
          <>
            {/* BIOPORTAL EVIDENCE CARD */}
            {bioportalItem && (
              <div style={{
                marginBottom: '8px', background: '#EEEDFE',
                border: '0.5px solid #AFA9EC', borderRadius: '8px', padding: '9px'
              }}>
                {/* BioPortal tag */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', color: '#3C3489', background: '#DDDCFD',
                  padding: '2px 6px', borderRadius: '4px', marginBottom: '5px'
                }}>
                  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                  BioPortal · Ontology Verified
                </div>

                {/* Ontology name + ID */}
                <div style={{
                  fontSize: '11px', fontWeight: 500, color: '#3C3489',
                  marginBottom: '4px', lineHeight: 1.4
                }}>
                  {bioportalItem.ontology_name || data.label}
                </div>

                {/* Semantic type badge */}
                {bioportalItem.semantic_type && (
                  <div style={{
                    display: 'inline-block', fontSize: '9px', fontWeight: 500,
                    color: '#7F77DD', background: '#fff', border: '0.5px solid #AFA9EC',
                    padding: '1px 5px', borderRadius: '3px', marginBottom: '5px'
                  }}>
                    {bioportalItem.semantic_type}
                  </div>
                )}

                {/* Definition */}
                {bioportalItem.definition && (
                  <div style={{
                    fontSize: '10px', color: '#4C4589', lineHeight: 1.5,
                    marginBottom: '5px'
                  }}>
                    {bioportalItem.definition}
                  </div>
                )}

                {/* Synonyms */}
                {bioportalItem.synonyms && bioportalItem.synonyms.length > 0 && (
                  <div style={{ marginBottom: '5px' }}>
                    <span style={{ fontSize: '9px', color: '#7F77DD', fontWeight: 500 }}>
                      Also known as:{' '}
                    </span>
                    <span style={{ fontSize: '9px', color: '#64748b' }}>
                      {bioportalItem.synonyms.slice(0, 3).join(', ')}
                    </span>
                  </div>
                )}

                {/* Footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', paddingTop: '5px',
                  borderTop: '0.5px solid #AFA9EC'
                }}>
                  <span style={{ fontSize: '9px', color: '#7F77DD' }}>
                    {bioportalItem.ontology_id}
                  </span>
                  {bioportalItem.concept_uri && (
                    
                      <a href={`https://bioportal.bioontology.org/ontologies/${bioportalItem.ontology_id}?p=classes&conceptid=${encodeURIComponent(bioportalItem.concept_uri)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: '#7F77DD', textDecoration: 'none' }}
                    >
                      View ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* CLINICALTRIALS EVIDENCE CARD */}
            {ctItem && ctItem.trials && ctItem.trials.length > 0 && (
              <div style={{
                marginBottom: '8px', background: '#EAF3DE',
                border: '0.5px solid #C0DD97', borderRadius: '8px', padding: '9px'
              }}>
                {/* ClinicalTrials tag */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '10px', color: '#3B6D11', background: '#D4EDBB',
                  padding: '2px 6px', borderRadius: '4px', marginBottom: '5px'
                }}>
                  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  ClinicalTrials.gov · {ctItem.trials.length} Trial{ctItem.trials.length > 1 ? 's' : ''}
                </div>

                {/* Trial list */}
                {ctItem.trials.slice(0, 2).map((trial, idx) => (
                  <div key={trial.nct_id} style={{
                    marginBottom: idx < ctItem.trials!.length - 1 ? '6px' : 0,
                    paddingBottom: idx < Math.min(ctItem.trials!.length, 2) - 1 ? '6px' : 0,
                    borderBottom: idx < Math.min(ctItem.trials!.length, 2) - 1 ? '0.5px solid #C0DD97' : 'none'
                  }}>
                    <div style={{
                      fontSize: '11px', fontWeight: 500, color: '#3B6D11',
                      lineHeight: 1.4, marginBottom: '3px'
                    }}>
                      {trial.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {/* Status badge */}
                      <span style={{
                        fontSize: '9px', fontWeight: 500,
                        background: trial.status === 'RECRUITING' ? '#D4EDBB' : '#f0f4f8',
                        color: trial.status === 'RECRUITING' ? '#3B6D11' : '#64748b',
                        padding: '1px 5px', borderRadius: '3px',
                        border: `0.5px solid ${trial.status === 'RECRUITING' ? '#C0DD97' : '#e2e8f0'}`
                      }}>
                        {trial.status}
                      </span>
                      {/* Phase badge */}
                      {trial.phase && trial.phase !== 'N/A' && (
                        <span style={{
                          fontSize: '9px', color: '#64748b',
                          background: '#f0f4f8', padding: '1px 5px',
                          borderRadius: '3px', border: '0.5px solid #e2e8f0'
                        }}>
                          {trial.phase}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Footer */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', paddingTop: '6px',
                  borderTop: '0.5px solid #C0DD97', marginTop: '6px'
                }}>
                  <span style={{ fontSize: '9px', color: '#3B6D11' }}>
                    {ctItem.trials[0].nct_id}
                  </span>
                  <a
                    href={ctItem.trials[0].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '10px', color: '#3B6D11', textDecoration: 'none' }}
                  >
                    View ↗
                  </a>
                </div>
              </div>
            )}

            {/* PUBMED EVIDENCE CARDS */}
            {pubmedItems.length > 0 ? (
              pubmedItems.map((item, idx) => (
                <div key={idx} style={{
                  marginBottom: '8px', background: '#f8fafc',
                  border: '0.5px solid #e2e8f0', borderRadius: '8px', padding: '9px'
                }}>
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

                  <div style={{
                    fontSize: '11px', fontWeight: 500, color: '#1a202c',
                    lineHeight: '1.4', marginBottom: '6px'
                  }}>
                    {item.title || 'Research Publication'}
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', paddingTop: '6px',
                    borderTop: '0.5px solid #e2e8f0'
                  }}>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>
                      PMID: {item.pubid}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      
                        <a href={`https://pubmed.ncbi.nlm.nih.gov/${item.pubid}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '10px', color: '#185FA5', textDecoration: 'none' }}
                      >
                        View ↗
                      </a>

                      {/* Bookmark button */}
                      <button
                        onClick={() => handleSaveArticle(item.pubid!, item.title!)}
                        disabled={savedPubids.has(item.pubid!) || savingId === item.pubid}
                        title={savedPubids.has(item.pubid!) ? 'Saved' : 'Save to PubMed Sync'}
                        style={{
                          background: 'none', border: 'none',
                          cursor: savedPubids.has(item.pubid!) ? 'default' : 'pointer',
                          padding: '2px', display: 'flex', alignItems: 'center',
                          color: savedPubids.has(item.pubid!) ? '#1D9E75' : '#94a3b8',
                          transition: 'color 0.15s'
                        }}
                        onMouseEnter={e => {
                          if (!savedPubids.has(item.pubid!))
                            (e.currentTarget as HTMLButtonElement).style.color = '#185FA5';
                        }}
                        onMouseLeave={e => {
                          if (!savedPubids.has(item.pubid!))
                            (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
                        }}
                      >
                        {savingId === item.pubid ? (
                          <span style={{ fontSize: '9px' }}>...</span>
                        ) : savedPubids.has(item.pubid!) ? (
                          <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M5 3a2 2 0 00-2 2v16l7-3 7 3V5a2 2 0 00-2-2H5z" />
                          </svg>
                        ) : (
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
              !bioportalItem && (
                <div style={{
                  background: '#f8fafc', border: '0.5px solid #e2e8f0',
                  borderRadius: '8px', padding: '9px'
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
            )}
          </>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', opacity: 0.4, paddingTop: '40px'
          }}>
            <svg width="32" height="32" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span style={{
              fontSize: '11px', color: '#94a3b8', marginTop: '8px', textAlign: 'center'
            }}>
              Select a node to view evidence
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 14px', borderTop: '0.5px solid #e2e8f0'
      }}>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
          RAG Engine · PubMed + BioPortal + ClinicalTrials
        </div>
        <div style={{ fontSize: '10px', color: '#1D9E75', marginTop: '2px' }}>
          ● 36M+ articles · 1500+ ontologies · ClinicalTrials.gov
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;