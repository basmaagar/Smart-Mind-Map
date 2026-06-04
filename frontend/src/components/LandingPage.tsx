import React, { useEffect, useRef, useState } from 'react';

interface LandingPageProps {
  onGetStarted: () => void;
}

const useInView = (threshold = 0.15) => {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
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
    up: 'translateY(28px)',
    left: 'translateX(-28px)',
    right: 'translateX(28px)',
    none: 'none',
  };

  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'none' : transforms[direction],
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
};

const ParticlesCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const mouse = { x: -1000, y: -1000 };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    window.addEventListener('mousemove', onMouseMove);

    const COUNT = 120;
    type Particle = { x: number; y: number; vx: number; vy: number; r: number; opacity: number };
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.2,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 100 && dist > 0) {
          p.x += (dx / dist) * 1.5;
          p.y += (dy / dist) * 1.5;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74, 158, 232, ${p.opacity})`;
        ctx.fill();
      });

      for (let i = 0; i < COUNT; i += 1) {
        for (let j = i + 1; j < COUNT; j += 1) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(74, 158, 232, ${0.15 * (1 - dist / 130)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animId = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }} />;
};

const steps = [
  {
    number: '01',
    title: 'A symptom enters the workspace.',
    subtitle: 'Fast symptom recognition',
    description:
      'You type a complaint or concept and the system immediately classifies it, anchors the language, and prepares the retrieval flow.',
    color: '#E24B4A',
    bg: '#FCEBEB',
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Live evidence is retrieved.',
    subtitle: 'PubMed RAG search',
    description:
      'The app queries live PubMed results and ranks the most relevant papers instead of relying on a static snapshot.',
    color: '#185FA5',
    bg: '#E6F1FB',
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Ontology context is attached.',
    subtitle: 'BioPortal enrichment',
    description:
      'Clinical concepts are linked to ontology terms and synonyms so the graph remains precise, searchable, and explainable.',
    color: '#0F766E',
    bg: '#E6F7F4',
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Trials and treatment context follow.',
    subtitle: 'ClinicalTrials.gov integration',
    description:
      'The system adds current trial and treatment context so the map reflects active clinical evidence, not old summaries.',
    color: '#1D9E75',
    bg: '#EAF3DE',
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
];

const sources = [
  { name: 'PubMed', stat: '36M+', label: 'peer-reviewed articles', color: '#185FA5', bg: '#E6F1FB', border: '#B5D4F4' },
  { name: 'BioPortal', stat: '1,500+', label: 'medical ontologies', color: '#0F766E', bg: '#E6F7F4', border: '#A7D7D1' },
  { name: 'ClinicalTrials.gov', stat: '400K+', label: 'registered trials', color: '#1D9E75', bg: '#EAF3DE', border: '#C0DD97' },
  { name: 'Graph RAG', stat: '∞', label: 'context-aware synthesis', color: '#BA7517', bg: '#FAEEDA', border: '#FAC775' },
];

const clinicalStages = [
  'Differential diagnosis',
  'Pathophysiology',
  'Diagnostic workup',
  'Treatment planning',
  'Monitoring and prognosis',
];

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div style={{ minHeight: '100vh', width: '100%', overflowX: 'hidden', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Manrope, Inter, system-ui, sans-serif' }}>
      <section style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b35 100%)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <ParticlesCanvas />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at top, rgba(10,15,30,0.08), transparent 45%)', zIndex: 2 }} />

        <nav style={{ position: 'relative', zIndex: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#185FA5', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(24,95,165,0.18)' }}>
              <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>MedMind</span>
          </div>
          <button
            onClick={onGetStarted}
            style={{ padding: '10px 20px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 10px 22px rgba(0,0,0,0.18)', backdropFilter: 'blur(10px)' }}
          >
            Sign in
          </button>
        </nav>

        <div style={{ position: 'relative', zIndex: 3, maxWidth: '1200px', margin: '0 auto', padding: '64px 32px 84px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: '40px', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', marginBottom: '26px', borderRadius: '999px', border: '1px solid rgba(24,95,165,0.35)', background: 'rgba(24,95,165,0.16)', backdropFilter: 'blur(10px)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4A9EE8' }} />
              <span style={{ fontSize: '12px', color: '#9ecaf7', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Clinical knowledge platform</span>
            </div>

            <h1 style={{ fontSize: 'clamp(42px, 6vw, 76px)', lineHeight: 1.02, margin: '0 0 18px', letterSpacing: '-0.05em', fontWeight: 800, color: '#fff' }}>
              Clinical evidence,
              <span style={{ display: 'block', color: '#4A9EE8' }}>organized around the symptom.</span>
            </h1>

            <p style={{ fontSize: '18px', lineHeight: 1.7, color: 'rgba(255,255,255,0.72)', margin: '0 0 34px', maxWidth: '640px' }}>
              MedMind turns a single complaint into a structured clinical map, combining live PubMed retrieval, ontology enrichment, and trial context in one workspace.
            </p>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <button
                onClick={onGetStarted}
                style={{ padding: '16px 42px', borderRadius: '999px', border: 'none', background: 'linear-gradient(135deg, #185FA5, #2A7FD4)', color: '#fff', fontSize: '16px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 16px 30px rgba(24,95,165,0.30)' }}
              >
                Start mapping
              </button>
              <button
                onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ padding: '16px 42px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '16px', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(10px)' }}
              >
                See how it works
              </button>
            </div>

            <div style={{ marginTop: '28px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['Live PubMed retrieval', 'Ontology enrichment', 'Clinical trials context'].map(item => (
                <span key={item} style={{ fontSize: '12px', color: '#cbd5e1', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', padding: '8px 12px', backdropFilter: 'blur(8px)' }}>{item}</span>
              ))}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.84)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: '28px', padding: '28px', boxShadow: '0 24px 60px rgba(15,23,42,0.08)', backdropFilter: 'blur(16px)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b', marginBottom: '20px' }}>Evidence stack</div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {sources.map(source => (
                <div key={source.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: '18px', background: 'rgba(248,250,252,0.94)', border: `1px solid ${source.border}` }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>{source.name}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{source.label}</div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: source.color }}>{source.stat}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: '34px', left: '50%', transform: 'translateX(-50%)', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.42)', letterSpacing: '3px', textTransform: 'uppercase' }}>Scroll</span>
          <div style={{ width: '1px', height: '36px', background: 'linear-gradient(to bottom, rgba(15,23,42,0.25), transparent)', animation: 'scrollPulse 2s ease-in-out infinite' }} />
        </div>
      </section>

      <section id="story" style={{ background: '#fff', padding: '116px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: '80px' }}>
              <div style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, color: '#185FA5', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' }}>The pipeline</div>
              <h2 style={{ fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 800, color: '#0a0f1e', letterSpacing: '-1.5px', margin: '0 0 18px', lineHeight: 1.08 }}>
                What happens in the seconds
                <span style={{ display: 'block', background: 'linear-gradient(135deg, #185FA5, #0F766E)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>after you type.</span>
              </h2>
              <p style={{ fontSize: '17px', color: '#64748b', lineHeight: 1.7, maxWidth: '540px', margin: '0 auto' }}>
                The landing page now opens with a clear clinical narrative instead of a neon demo look.
              </p>
            </div>
          </FadeIn>

          <div style={{ display: 'grid', gap: '26px' }}>
            {steps.map((step, index) => (
              <FadeIn key={step.number} delay={0.04 * index} direction={index % 2 === 0 ? 'left' : 'right'}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)', gap: '28px', alignItems: 'center', padding: '28px', borderRadius: '24px', border: '1px solid rgba(15,23,42,0.08)', background: index % 2 === 0 ? 'linear-gradient(135deg, #fff, #f8fbff)' : 'linear-gradient(135deg, #fff, #f9fcfb)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: step.bg, border: `1.5px solid ${step.color}25`, display: 'grid', placeItems: 'center', color: step.color, flexShrink: 0 }}>{step.icon}</div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: step.color, letterSpacing: '2.5px', textTransform: 'uppercase' }}>Step {step.number}</span>
                    </div>
                    <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#0a0f1e', margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.16 }}>{step.title}</h3>
                    <div style={{ fontSize: '13px', color: step.color, fontWeight: 600, marginBottom: '14px' }}>{step.subtitle}</div>
                    <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.8, margin: 0 }}>{step.description}</p>
                  </div>

                  <div style={{ padding: '28px', borderRadius: '20px', border: `1px solid ${step.color}18`, background: `linear-gradient(135deg, ${step.bg}, #ffffff)`, boxShadow: `0 20px 50px ${step.color}10` }}>
                    <div style={{ fontSize: '72px', fontWeight: 900, color: `${step.color}14`, lineHeight: 1, marginBottom: '12px', letterSpacing: '-4px' }}>{step.number}</div>
                    <div style={{ height: '3px', width: '40px', borderRadius: '2px', marginBottom: '14px', background: `linear-gradient(to right, ${step.color}, ${step.color}30)` }} />
                    <div style={{ fontSize: '14px', color: step.color, fontWeight: 600 }}>{step.subtitle}</div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: 'linear-gradient(135deg, #f8fafc, #eef6ff)', padding: '116px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: '68px' }}>
              <div style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, color: '#0F766E', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' }}>Evidence sources</div>
              <h2 style={{ fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 800, color: '#0a0f1e', letterSpacing: '-1.5px', margin: '0 0 18px', lineHeight: 1.08 }}>
                Four sources.
                <span style={{ display: 'block', background: 'linear-gradient(135deg, #0F766E, #185FA5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>One coherent answer.</span>
              </h2>
              <p style={{ fontSize: '17px', color: '#64748b', lineHeight: 1.7, maxWidth: '540px', margin: '0 auto' }}>
                Each source fills a different gap so the final map stays specific, current, and clinically grounded.
              </p>
            </div>
          </FadeIn>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {sources.map((source, index) => (
              <FadeIn key={source.name} delay={index * 0.06}>
                <div style={{ background: '#fff', border: `1px solid ${source.border}`, borderRadius: '20px', padding: '30px', boxShadow: `0 6px 24px ${source.color}0c` }}>
                  <div style={{ fontSize: '38px', fontWeight: 900, color: source.color, lineHeight: 1, marginBottom: '6px' }}>{source.stat}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>{source.label}</div>
                  <div style={{ display: 'inline-block', fontSize: '12px', fontWeight: 700, color: source.color, background: source.bg, padding: '5px 10px', borderRadius: '8px', border: `1px solid ${source.border}` }}>{source.name}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#fff', padding: '116px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.95fr)', gap: '32px', alignItems: 'start' }}>
          <FadeIn direction="left">
            <div>
              <div style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, color: '#E24B4A', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' }}>Clinical reasoning</div>
              <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', fontWeight: 800, color: '#0a0f1e', letterSpacing: '-1px', margin: '0 0 18px', lineHeight: 1.1 }}>
                From symptom
                <br />to management.
                <span style={{ display: 'block', color: '#185FA5' }}>In five stages.</span>
              </h2>
              <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.8, margin: '0 0 28px', maxWidth: '620px' }}>
                The clinical panel keeps the flow readable and makes the sequencing explicit instead of hiding it behind dense AI-styled visuals.
              </p>

              <div style={{ display: 'grid', gap: '10px' }}>
                {clinicalStages.map((stage, index) => (
                  <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${index === 0 ? '#f4c2c2' : index === 1 ? '#b5d4f4' : index === 2 ? '#a7d7d1' : index === 3 ? '#c0dd97' : '#fac775'}`, background: index === 0 ? '#fff7f7' : index === 1 ? '#f7fbff' : index === 2 ? '#f4fbfa' : index === 3 ? '#f5fbef' : '#fff8eb' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, background: index === 0 ? '#E24B4A' : index === 1 ? '#185FA5' : index === 2 ? '#0F766E' : index === 3 ? '#1D9E75' : '#BA7517', display: 'grid', placeItems: 'center', color: '#fff', fontSize: '11px', fontWeight: 700 }}>{index + 1}</div>
                    <span style={{ fontSize: '14px', color: '#334155', fontWeight: 600 }}>{stage}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn direction="right">
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#185FA5', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#185FA5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Clinical reasoning active</span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Root symptom</div>
                <div style={{ background: '#FCEBEB', border: '1px solid #F09595', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', fontWeight: 600, color: '#E24B4A' }}>Chest pain</div>
              </div>

              <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Stage progress</div>
              {[
                { label: 'Differential diagnosis', done: true, active: false },
                { label: 'Pathophysiology', done: false, active: true },
                { label: 'Diagnostic workup', done: false, active: false },
                { label: 'Treatment', done: false, active: false },
                { label: 'Monitoring', done: false, active: false },
              ].map(stage => (
                <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', marginBottom: '4px', background: stage.active ? '#E6F1FB' : stage.done ? '#EAF3DE' : 'transparent', border: stage.active ? '1px solid #B5D4F4' : stage.done ? '1px solid #C0DD97' : '1px solid transparent' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, background: stage.done ? '#1D9E75' : stage.active ? '#185FA5' : '#e2e8f0', display: 'grid', placeItems: 'center' }}>
                    {stage.done && (
                      <svg width="10" height="10" fill="none" stroke="#fff" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: stage.active ? 600 : 400, color: stage.active ? '#185FA5' : stage.done ? '#1D9E75' : '#94a3b8' }}>{stage.label}</span>
                  {stage.active && <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: '#185FA5', animation: 'pulse 1.5s infinite' }} />}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      <section style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b35 100%)', padding: '132px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '700px', height: '700px', background: 'radial-gradient(circle, rgba(24,95,165,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 2 }}>
          <FadeIn>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(24,95,165,0.18)', border: '1px solid rgba(24,95,165,0.35)', borderRadius: '50px', padding: '6px 16px', marginBottom: '32px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4A9EE8' }} />
              <span style={{ fontSize: '13px', color: '#9ecaf7', fontWeight: 600 }}>Ready when you are</span>
            </div>

            <h2 style={{ fontSize: 'clamp(34px, 5vw, 64px)', fontWeight: 800, color: '#fff', letterSpacing: '-2px', margin: '0 0 18px', lineHeight: 1.05 }}>
              The map is waiting.
              <span style={{ display: 'block', background: 'linear-gradient(135deg, #4A9EE8, #0F766E)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>What's your first symptom?</span>
            </h2>

            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.68)', lineHeight: 1.7, margin: '0 0 44px' }}>
              Start with a complaint, a sign, or a diagnosis and build a structured evidence map around it.
            </p>

            <button
              onClick={onGetStarted}
              style={{ padding: '18px 56px', background: 'linear-gradient(135deg, #185FA5, #2A7FD4)', border: 'none', borderRadius: '999px', color: '#fff', fontSize: '18px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 60px rgba(24,95,165,0.34)' }}
            >
              Start mapping
            </button>
          </FadeIn>
        </div>
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes floatParticle {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          100% { transform: translate3d(0, -18px, 0) scale(1.08); }
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
