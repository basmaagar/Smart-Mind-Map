import React, { useState, useEffect, useRef } from 'react';

interface LandingPageProps {
  onGetStarted: () => void;
}

// --- FADE IN ON SCROLL ---
const useInView = (threshold = 0.15) => {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
};

const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'left' | 'right' | 'none';
}> = ({ children, delay = 0, direction = 'up' }) => {
  const { ref, inView } = useInView();
  const transforms: Record<string, string> = {
    up: 'translateY(40px)', left: 'translateX(-40px)',
    right: 'translateX(40px)', none: 'none'
  };
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'none' : transforms[direction],
      transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`
    }}>
      {children}
    </div>
  );
};

// --- MAIN COMPONENT ---
const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const steps = [
    {
      number: '01',
      title: 'A patient walks in.',
      subtitle: 'Type any symptom or concept',
      description: "It starts with a single word. A complaint. A finding. A diagnosis you're trying to understand. You type it — and the system wakes up.",
      color: '#E24B4A', bg: '#FCEBEB',
      icon: <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    },
    {
      number: '02',
      title: '36 million papers searched.',
      subtitle: 'Live PubMed RAG retrieval',
      description: "In real time, MedMind queries the entire PubMed database. Not a cached snapshot — live retrieval. The most relevant peer-reviewed evidence surfaces in seconds.",
      color: '#185FA5', bg: '#E6F1FB',
      icon: <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    },
    {
      number: '03',
      title: 'Ontologies consulted.',
      subtitle: 'BioPortal enrichment across 1,500+ ontologies',
      description: "Every concept is cross-referenced against SNOMED CT, Disease Ontology, MeSH, and the NCI Thesaurus. Synonyms found. Semantic types confirmed. Nothing assumed.",
      color: '#7F77DD', bg: '#EEEDFE',
      icon: <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>
    },
    {
      number: '04',
      title: 'Trials discovered.',
      subtitle: 'ClinicalTrials.gov live integration',
      description: "Active clinical trials, completed studies, ongoing protocols — attached as evidence. Your knowledge map reflects the current state of medicine, not a textbook from five years ago.",
      color: '#1D9E75', bg: '#EAF3DE',
      icon: <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
    },
    {
      number: '05',
      title: 'The map comes alive.',
      subtitle: 'Graph RAG + LLM synthesis',
      description: "All four sources converge. The AI reasons through the evidence, aware of everything already mapped, and suggests what comes next — grounded, specific, never redundant.",
      color: '#BA7517', bg: '#FAEEDA',
      icon: <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
  ];

  const sources = [
    { name: 'PubMed', stat: '36M+', label: 'peer-reviewed articles', color: '#185FA5', bg: '#E6F1FB', border: '#B5D4F4' },
    { name: 'BioPortal', stat: '1,500+', label: 'medical ontologies', color: '#7F77DD', bg: '#EEEDFE', border: '#AFA9EC' },
    { name: 'ClinicalTrials.gov', stat: '400K+', label: 'registered trials', color: '#1D9E75', bg: '#EAF3DE', border: '#C0DD97' },
    { name: 'Neo4j Graph RAG', stat: '∞', label: 'contextual memory', color: '#BA7517', bg: '#FAEEDA', border: '#FAC775' },
  ];

  return (
    <div style={{ fontFamily: 'Manrope, Inter, system-ui, sans-serif', background: '#f5f7fb', color: '#0f172a', overflowX: 'hidden' }}>

      {/* ======== HERO ======== */}
      <section style={{
        minHeight: '100vh', position: 'relative',
        background: 'radial-gradient(circle at top left, rgba(24,95,165,0.10), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #eef3f8 100%)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderBottom: '1px solid rgba(15,23,42,0.08)'
      }}>
        <div style={{
          position: 'absolute', top: '12%', right: '-120px', width: '360px', height: '360px',
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(24,95,165,0.16), transparent 70%)',
          filter: 'blur(12px)', pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute', bottom: '-140px', left: '-100px', width: '340px', height: '340px',
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(29,158,117,0.10), transparent 70%)',
          filter: 'blur(8px)', pointerEvents: 'none'
        }} />

        {/* Nav */}
        <nav style={{
          position: 'relative', width: '100%',
          padding: '24px 32px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', background: '#185FA5', borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(24,95,165,0.18)'
            }}>
              <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
              MedMind
            </span>
          </div>
          <button onClick={onGetStarted} style={{
            padding: '10px 20px', background: '#0f172a',
            border: '1px solid rgba(15,23,42,0.10)', borderRadius: '999px',
            color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 10px 22px rgba(15,23,42,0.10)', transition: 'all 0.25s ease'
          }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'}
          >
            Sign In
          </button>
        </nav>

        {/* Hero content */}
        <div style={{
          position: 'relative', zIndex: 5,
          width: '100%', maxWidth: '1200px', margin: '0 auto',
          padding: '64px 32px 80px',
          display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)',
          gap: '40px', alignItems: 'center'
        }}>
          <div style={{ maxWidth: '680px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(24,95,165,0.08)', border: '1px solid rgba(24,95,165,0.14)',
              borderRadius: '999px', padding: '6px 14px', marginBottom: '28px'
            }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%', background: '#185FA5'
              }} />
              <span style={{ fontSize: '12px', color: '#185FA5', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Clinical knowledge platform
              </span>
            </div>

            <h1 style={{
              fontSize: 'clamp(42px, 6vw, 78px)', fontWeight: 800,
              color: '#0f172a', lineHeight: 1.02, letterSpacing: '-0.04em', margin: '0 0 18px'
            }}>
              Clinical evidence,
              <span style={{ display: 'block', color: '#185FA5' }}>
                organized around the symptom.
              </span>
            </h1>

            <p style={{
              fontSize: '18px', color: '#475569',
              lineHeight: 1.7, margin: '0 0 34px', maxWidth: '620px'
            }}>
              MedMind turns a single complaint into a structured clinical map, combining PubMed retrieval, ontology enrichment, and live trial context in one workspace.
            </p>

            <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} style={{
              padding: '16px 44px',
              background: 'linear-gradient(135deg, #185FA5, #1f6cb8)',
              border: 'none', borderRadius: '50px', color: '#fff',
              fontSize: '16px', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 16px 30px rgba(24,95,165,0.20)', transition: 'all 0.3s'
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 18px 34px rgba(24,95,165,0.28)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 16px 30px rgba(24,95,165,0.20)';
              }}
            >
              Start Mapping →
            </button>
            <button
              onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                padding: '16px 44px', background: 'transparent',
                border: '1px solid rgba(15,23,42,0.12)', borderRadius: '50px',
                color: '#0f172a', fontSize: '16px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.3s'
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(24,95,165,0.35)';
                (e.currentTarget as HTMLButtonElement).style.color = '#185FA5';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(15,23,42,0.12)';
                (e.currentTarget as HTMLButtonElement).style.color = '#0f172a';
              }}
            >
              See how it works
            </button>
          </div>

          <div style={{ marginTop: '28px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#64748b', background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: '999px', padding: '8px 12px' }}>Live PubMed retrieval</span>
            <span style={{ fontSize: '12px', color: '#64748b', background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: '999px', padding: '8px 12px' }}>Ontology enrichment</span>
            <span style={{ fontSize: '12px', color: '#64748b', background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: '999px', padding: '8px 12px' }}>Clinical trials context</span>
          </div>

          </div>

          <div style={{
            background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(15,23,42,0.08)',
            borderRadius: '28px', padding: '28px', boxShadow: '0 24px 60px rgba(15,23,42,0.08)',
            backdropFilter: 'blur(16px)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: '20px' }}>
              Evidence stack
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {sources.map(source => (
                <div key={source.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 18px', borderRadius: '18px',
                  background: 'rgba(248,250,252,0.9)', border: `1px solid ${source.border}`
                }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                      {source.name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      {source.label}
                    </div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: source.color }}>
                    {source.stat}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Scroll hint */}
        <div style={{
          position: 'absolute', bottom: '36px', left: '50%',
          transform: 'translateX(-50%)', zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
        }}>
          <span style={{ fontSize: '10px', color: 'rgba(15,23,42,0.40)', letterSpacing: '3px', textTransform: 'uppercase' }}>
            Scroll
          </span>
          <div style={{
            width: '1px', height: '36px',
            background: 'linear-gradient(to bottom, rgba(15,23,42,0.25), transparent)',
            animation: 'scrollPulse 2s ease-in-out infinite'
          }} />
        </div>
      </section>

      {/* ======== STORY SECTION ======== */}
      <section id="story" style={{ background: '#fff', padding: '120px 24px' }}>
        <div style={{ maxWidth: '1060px', margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: '88px' }}>
              <div style={{
                display: 'inline-block', fontSize: '11px', fontWeight: 700,
                color: '#185FA5', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px'
              }}>
                The Pipeline
              </div>
              <h2 style={{
                fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 800,
                color: '#0a0f1e', letterSpacing: '-1.5px', margin: '0 0 18px', lineHeight: 1.1
              }}>
                What happens in the seconds<br />
                <span style={{
                  background: 'linear-gradient(135deg, #185FA5, #7F77DD)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>
                  after you type.
                </span>
              </h2>
              <p style={{ fontSize: '17px', color: '#64748b', lineHeight: 1.7, maxWidth: '480px', margin: '0 auto' }}>
                Five things happen simultaneously — and most AI tools do none of them.
              </p>
            </div>
          </FadeIn>

          {steps.map((step, idx) => (
            <FadeIn key={step.number} delay={0.05} direction={idx % 2 === 0 ? 'left' : 'right'}>
              <div style={{
                display: 'flex',
                flexDirection: idx % 2 === 0 ? 'row' : 'row-reverse',
                alignItems: 'center', gap: '64px',
                marginBottom: '88px', flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '46px', height: '46px', borderRadius: '14px',
                      background: step.bg, border: `1.5px solid ${step.color}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: step.color, flexShrink: 0
                    }}>
                      {step.icon}
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, color: step.color,
                      letterSpacing: '2.5px', textTransform: 'uppercase'
                    }}>
                      Step {step.number}
                    </span>
                  </div>
                  <h3 style={{
                    fontSize: '28px', fontWeight: 800, color: '#0a0f1e',
                    margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.2
                  }}>
                    {step.title}
                  </h3>
                  <div style={{
                    fontSize: '13px', color: step.color, fontWeight: 600,
                    marginBottom: '14px', letterSpacing: '0.2px'
                  }}>
                    {step.subtitle}
                  </div>
                  <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.8, margin: 0 }}>
                    {step.description}
                  </p>
                </div>

                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div style={{
                    background: `linear-gradient(135deg, ${step.bg}, #ffffff)`,
                    border: `1px solid ${step.color}18`,
                    borderRadius: '20px', padding: '40px',
                    boxShadow: `0 24px 64px ${step.color}12`
                  }}>
                    <div style={{
                      fontSize: '80px', fontWeight: 900, color: `${step.color}12`,
                      lineHeight: 1, marginBottom: '16px', letterSpacing: '-4px'
                    }}>
                      {step.number}
                    </div>
                    <div style={{
                      height: '3px', width: '40px', borderRadius: '2px', marginBottom: '16px',
                      background: `linear-gradient(to right, ${step.color}, ${step.color}30)`
                    }} />
                    <div style={{ fontSize: '14px', color: step.color, fontWeight: 600 }}>
                      {step.subtitle}
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ======== SOURCES SECTION ======== */}
      <section style={{
        background: 'linear-gradient(135deg, #f8fafc, #f0f4ff)',
        padding: '120px 24px'
      }}>
        <div style={{ maxWidth: '1060px', margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: '72px' }}>
              <div style={{
                display: 'inline-block', fontSize: '11px', fontWeight: 700,
                color: '#7F77DD', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px'
              }}>
                Evidence Sources
              </div>
              <h2 style={{
                fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 800,
                color: '#0a0f1e', letterSpacing: '-1.5px', margin: '0 0 18px', lineHeight: 1.1
              }}>
                Not one source.<br />
                <span style={{
                  background: 'linear-gradient(135deg, #7F77DD, #185FA5)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>
                  Four — working in parallel.
                </span>
              </h2>
              <p style={{ fontSize: '17px', color: '#64748b', lineHeight: 1.7, maxWidth: '480px', margin: '0 auto' }}>
                Each source fills a gap the others leave. Together they produce evidence no single API can match.
              </p>
            </div>
          </FadeIn>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px'
          }}>
            {sources.map((s, idx) => (
              <FadeIn key={s.name} delay={idx * 0.08}>
                <div style={{
                  background: '#fff', border: `1px solid ${s.border}`,
                  borderRadius: '20px', padding: '32px',
                  boxShadow: `0 4px 24px ${s.color}0d`,
                  transition: 'transform 0.3s, box-shadow 0.3s', cursor: 'default'
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-6px)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 20px 40px ${s.color}18`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 24px ${s.color}0d`;
                  }}
                >
                  <div style={{ fontSize: '38px', fontWeight: 900, color: s.color, lineHeight: 1, marginBottom: '4px' }}>
                    {s.stat}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>{s.label}</div>
                  <div style={{
                    display: 'inline-block', fontSize: '12px', fontWeight: 600,
                    color: s.color, background: s.bg, padding: '4px 10px',
                    borderRadius: '6px', border: `1px solid ${s.border}`
                  }}>
                    {s.name}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ======== CLINICAL MODE SECTION ======== */}
      <section style={{ background: '#fff', padding: '120px 24px' }}>
        <div style={{ maxWidth: '1060px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '72px', flexWrap: 'wrap' }}>
            <FadeIn direction="left">
              <div style={{ flex: 1, minWidth: '300px' }}>
                <div style={{
                  display: 'inline-block', fontSize: '11px', fontWeight: 700,
                  color: '#E24B4A', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px'
                }}>
                  Clinical Reasoning Mode
                </div>
                <h2 style={{
                  fontSize: 'clamp(28px, 3.5vw, 48px)', fontWeight: 800,
                  color: '#0a0f1e', letterSpacing: '-1px', margin: '0 0 18px', lineHeight: 1.1
                }}>
                  From symptom<br />to management.<br />
                  <span style={{ color: '#E24B4A' }}>In five stages.</span>
                </h2>
                <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.8, margin: '0 0 28px' }}>
                  Type a symptom — MedMind detects it automatically and activates a five-stage clinical reasoning pipeline. Each stage builds on the previous one, gated by your own clinical judgement.
                </p>
                {[
                  { label: 'Differential Diagnosis', color: '#E24B4A' },
                  { label: 'Pathophysiology', color: '#185FA5' },
                  { label: 'Diagnostic Workup', color: '#7F77DD' },
                  { label: 'Treatment', color: '#1D9E75' },
                  { label: 'Monitoring & Prognosis', color: '#BA7517' },
                ].map((stage, i) => (
                  <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                      background: `${stage.color}12`, border: `1.5px solid ${stage.color}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 700, color: stage.color
                    }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: '14px', color: '#334155', fontWeight: 500 }}>{stage.label}</span>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn direction="right">
              <div style={{ flex: 1, minWidth: '300px' }}>
                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: '20px', padding: '28px',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.07)'
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0'
                  }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E24B4A', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#E24B4A' }}>
                      Clinical Reasoning — Active
                    </span>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                      Root Symptom
                    </div>
                    <div style={{
                      background: '#FCEBEB', border: '1px solid #F09595',
                      borderRadius: '8px', padding: '10px 14px',
                      fontSize: '14px', fontWeight: 600, color: '#E24B4A'
                    }}>
                      Chest Pain
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                    Stage Progress
                  </div>
                  {[
                    { label: 'Differential Dx', done: true, active: false },
                    { label: 'Pathophysiology', done: false, active: true },
                    { label: 'Workup', done: false, active: false },
                    { label: 'Treatment', done: false, active: false },
                    { label: 'Monitoring', done: false, active: false },
                  ].map(s => (
                    <div key={s.label} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px 12px', borderRadius: '8px', marginBottom: '4px',
                      background: s.active ? '#E6F1FB' : s.done ? '#EAF3DE' : 'transparent',
                      border: s.active ? '1px solid #B5D4F4' : s.done ? '1px solid #C0DD97' : '1px solid transparent'
                    }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        background: s.done ? '#1D9E75' : s.active ? '#185FA5' : '#e2e8f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {s.done && (
                          <svg width="10" height="10" fill="none" stroke="#fff" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: '13px', fontWeight: s.active ? 600 : 400,
                        color: s.active ? '#185FA5' : s.done ? '#1D9E75' : '#94a3b8'
                      }}>
                        {s.label}
                      </span>
                      {s.active && (
                        <div style={{
                          marginLeft: 'auto', width: '6px', height: '6px',
                          borderRadius: '50%', background: '#185FA5', animation: 'pulse 1.5s infinite'
                        }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ======== FINAL CTA ======== */}
      <section style={{
        background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b35 100%)',
        padding: '140px 24px', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '700px', height: '700px',
          background: 'radial-gradient(circle, rgba(24,95,165,0.12) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 2 }}>
          <FadeIn>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(24,95,165,0.18)', border: '1px solid rgba(24,95,165,0.35)',
              borderRadius: '50px', padding: '6px 16px', marginBottom: '32px'
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4A9EE8' }} />
              <span style={{ fontSize: '13px', color: '#7AB8F5', fontWeight: 500 }}>Ready when you are</span>
            </div>

            <h2 style={{
              fontSize: 'clamp(34px, 5vw, 64px)', fontWeight: 800, color: '#fff',
              letterSpacing: '-2px', margin: '0 0 18px', lineHeight: 1.05
            }}>
              The map is waiting.<br />
              <span style={{
                background: 'linear-gradient(135deg, #4A9EE8, #7F77DD)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
              }}>
                What's your first symptom?
              </span>
            </h2>

            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 48px' }}>
              Join a new generation of clinicians who don't memorize knowledge — they map it, ground it in evidence, and reason through it systematically.
            </p>

            <button onClick={onGetStarted} style={{
              padding: '18px 56px',
              background: 'linear-gradient(135deg, #185FA5, #2A7FD4)',
              border: 'none', borderRadius: '50px', color: '#fff',
              fontSize: '18px', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 60px rgba(24,95,165,0.55)', transition: 'all 0.3s'
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px) scale(1.02)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 60px rgba(24,95,165,0.75)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0) scale(1)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 60px rgba(24,95,165,0.55)';
              }}
            >
              Start Mapping — It's Free
            </button>

            <div style={{ marginTop: '48px', display: 'flex', justifyContent: 'center', gap: '28px', flexWrap: 'wrap' }}>
              {['● PubMed · 36M+ articles', '● BioPortal · 1,500+ ontologies', '● ClinicalTrials.gov · Live'].map(item => (
                <span key={item} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>{item}</span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes scrollPulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.7; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
};

export default LandingPage;