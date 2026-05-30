import React, { useState } from 'react';
import axios from 'axios';

interface AuthProps {
  onAuthSuccess: (token: string, email: string, fullName: string) => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await axios.post('http://127.0.0.1:8000/auth/register', {
          email: email.trim(),
          password,
          full_name: fullName.trim()
        });
        onAuthSuccess(res.data.access_token, res.data.user_email, res.data.full_name);
      } else {
        const formData = new FormData();
        formData.append('username', email.trim());
        formData.append('password', password);
        const res = await axios.post('http://127.0.0.1:8000/auth/login', formData);
        onAuthSuccess(res.data.access_token, res.data.user_email, res.data.full_name);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f0f4f8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '12px',
        border: '0.5px solid #e2e8f0', padding: '40px',
        width: '100%', maxWidth: '400px'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <div style={{
            width: '36px', height: '36px', background: '#185FA5',
            borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <svg width="20" height="20" fill="none" stroke="#fff" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a202c' }}>MedMind</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>Clinical Knowledge System</div>
          </div>
        </div>

        {/* Title */}
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1a202c', margin: '0 0 4px' }}>
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 24px' }}>
          {mode === 'login'
            ? 'Sign in to access your knowledge maps'
            : 'Start building medical knowledge maps'}
        </p>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', background: '#f0f4f8', borderRadius: '8px',
          padding: '4px', marginBottom: '24px'
        }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '7px', borderRadius: '6px', border: 'none',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#185FA5' : '#64748b',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'register' && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
                Full Name
              </label>
              <input
                type="text"
                placeholder="Dr. Jane Smith"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: '8px',
                  border: '0.5px solid #e2e8f0', fontSize: '13px',
                  outline: 'none', boxSizing: 'border-box',
                  background: '#f8fafc', color: '#1a202c'
                }}
                onFocus={e => e.target.style.borderColor = '#185FA5'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
              Email Address
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '0.5px solid #e2e8f0', fontSize: '13px',
                outline: 'none', boxSizing: 'border-box',
                background: '#f8fafc', color: '#1a202c'
              }}
              onFocus={e => e.target.style.borderColor = '#185FA5'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                border: '0.5px solid #e2e8f0', fontSize: '13px',
                outline: 'none', boxSizing: 'border-box',
                background: '#f8fafc', color: '#1a202c'
              }}
              onFocus={e => e.target.style.borderColor = '#185FA5'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            marginTop: '14px', padding: '10px 12px',
            background: '#FCEBEB', border: '0.5px solid #F09595',
            borderRadius: '8px', fontSize: '12px', color: '#A32D2D'
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', marginTop: '20px', padding: '11px',
            background: loading ? '#94a3b8' : '#185FA5',
            color: '#fff', border: 'none', borderRadius: '8px',
            fontSize: '14px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s'
          }}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', marginTop: '20px', marginBottom: 0 }}>
          MedMind OS · Clinical Knowledge System
        </p>
      </div>
    </div>
  );
};

export default Auth;