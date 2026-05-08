import React from 'react';
import axios from 'axios';

interface SidebarProps {
  data: { label: string, evidence: any[] } | null;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ data, onClose }) => {
  const handleFetchFullText = async (pubid: string) => {
    try {
      const res = await axios.post("http://127.0.0.1:8000/fetch-full-evidence", { pubid });
      if (res.data.full_content) {
        alert(`PUBMED_DATA_DUMP [ID: ${pubid}]:\n\n${res.data.full_content}`);
      }
    } catch (err) {
      console.error("Link error:", err);
    }
  };

  return (
    <aside style={{ width: '320px', borderLeft: '1px solid #111', display: 'flex', flexDirection: 'column', backgroundColor: 'black', overflow: 'hidden', flexShrink: 0 }}>
      {/* Panel Header */}
      <div style={{ padding: '24px', borderBottom: '1px solid #111', backgroundColor: '#050505' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#00ff00', letterSpacing: '0.3em', textTransform: 'uppercase' }}>Intelligence</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(0, 255, 0, 0.1)', padding: '2px 8px', borderRadius: '2px', border: '1px solid rgba(0, 255, 0, 0.2)' }}>
             <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#00ff00' }} />
             <span style={{ fontSize: '8px', fontWeight: 'bold', color: '#00ff00', textTransform: 'uppercase' }}>Live</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>RAG_ENGINE_ACTIVE</span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'white', textTransform: 'uppercase', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data?.label || "IDLE_STATE"}</span>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {data ? (
          <>
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '9px', fontWeight: 'bold', color: '#222', textTransform: 'uppercase', letterSpacing: '0.4em', marginBottom: '16px' }}>Data Sources</h3>
              {data.evidence && data.evidence.length > 0 ? (
                data.evidence.map((item, idx) => (
                  <div key={idx} style={{ marginBottom: '12px', padding: '16px', backgroundColor: '#050505', border: '1px solid #111' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00ff00', marginBottom: '12px' }}>
                       <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                       <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Source_00{idx + 1}: PubMed</span>
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 'bold', color: 'white', lineHeight: '1.5', textTransform: 'uppercase', marginBottom: '8px' }}>
                      {item.title || "Research Publication"}
                    </p>
                    <p style={{ fontSize: '10px', color: '#444', lineHeight: '1.4', textTransform: 'uppercase', marginBottom: '12px' }}>
                      {item.snippet || "No additional metadata available in current session."}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingTop: '8px', borderTop: '1px solid #111' }}>
                       <span style={{ fontSize: '8px', fontWeight: 'bold', color: '#00ff00', textTransform: 'uppercase' }}>PMID: {item.pubid}</span>
                       
                       <a
                         href={`https://pubmed.ncbi.nlm.nih.gov/${item.pubid}/`}
                         target="_blank"
                         rel="noopener noreferrer"
                         style={{
                           fontSize: '8px',
                           fontWeight: 'bold',
                           color: '#007fff',
                           textTransform: 'uppercase',
                           cursor: 'pointer',
                           textDecoration: 'none'
                         }}
                       >
                         View_Abstract ↗
                       </a>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '10px', color: '#222', textTransform: 'uppercase', fontWeight: 'bold', fontStyle: 'italic', padding: '40px 0', textAlign: 'center' }}>
                   No specific evidence links found.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
               <h3 style={{ fontSize: '9px', fontWeight: 'bold', color: '#222', textTransform: 'uppercase', letterSpacing: '0.4em', marginBottom: '16px' }}>RAG Sources</h3>
               <div style={{ padding: '16px', border: '1px solid #111', backgroundColor: '#050505', opacity: 0.3 }}>
                  <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase' }}>Entries Waiting in Queue...</span>
               </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.1 }}>
             <div style={{ width: '80px', height: '80px', border: '2px dashed #444', borderRadius: '2px', marginBottom: '16px' }} />
             <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5em' }}>Waiting for Node Select...</span>
          </div>
        )}
      </div>

      {/* Panel Footer */}
      <div style={{ padding: '24px', borderTop: '1px solid #111', backgroundColor: 'black' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8px', fontWeight: 'bold', color: '#222', textTransform: 'uppercase', letterSpacing: '0.4em' }}>
           <span>IO_PROCESS_01</span>
           <span>0x7f3e2</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;