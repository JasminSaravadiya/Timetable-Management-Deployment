import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { API_URL } from '../config';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const setToken = useAuthStore((state) => state.setToken);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.access_token);
      } else {
        setError('Invalid username or password');
      }
    } catch (err) {
      setError('Connection to server failed.');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#0D0F14',
        fontFamily: "'Inter', sans-serif",
        color: '#E5E7EB',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Ambient glow orbs ── */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          left: '-150px',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,181,253,0.12) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-150px',
          right: '-150px',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(103,232,249,0.1) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Login Form Container (Glassmorphism) ── */}
      <form
        onSubmit={handleLogin}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          width: '380px',
          padding: '40px',
          background: 'rgba(28, 31, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(46, 51, 69, 0.8)',
          borderRadius: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          zIndex: 1,
        }}
      >
        {/* Logo and Header */}
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(196, 181, 253, 0.25)',
            }}
          >
            📅
          </div>
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Master Timetable
          </h2>
          <p style={{ color: '#9CA3AF', fontSize: '14px', marginTop: '6px', opacity: 0.85 }}>
            Sign in to manage your schedule
          </p>
        </div>

        {error && (
          <div
            style={{
              color: '#F87171',
              backgroundColor: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.2)',
              fontSize: '14px',
              padding: '10px 14px',
              borderRadius: '12px',
              textAlign: 'center',
              fontWeight: 500,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* TRAP INPUTS */}
        <div style={{ display: 'none' }}>
          <input type="text" name="username_trap" id="username_trap" />
          <input type="password" name="password_trap" id="password_trap" />
        </div>

        {/* Username Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Username
          </label>
          <input
            type="text"
            name={`usr_${Math.random().toString(36).substring(2, 8)}`}
            autoComplete="new-password"
            readOnly={true}
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{
              padding: '14px 16px',
              fontSize: '15px',
              borderRadius: '14px',
              background: '#0D0F14',
              border: '1px solid #2E3345',
              color: '#E5E7EB',
              outline: 'none',
              transition: 'all 0.2s ease',
              fontFamily: "'Inter', sans-serif",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLInputElement).style.borderColor = '#4B5563';
            }}
            onMouseLeave={(e) => {
              if (document.activeElement !== e.target) {
                (e.target as HTMLInputElement).style.borderColor = '#2E3345';
              }
            }}
            onFocus={(e) => {
              e.target.removeAttribute('readonly');
              (e.target as HTMLInputElement).style.borderColor = '#7C3AED';
              (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.15)';
            }}
            onBlur={(e) => {
              (e.target as HTMLInputElement).style.borderColor = '#2E3345';
              (e.target as HTMLInputElement).style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Password Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Password
          </label>
          <input
            type="password"
            name={`pwd_${Math.random().toString(36).substring(2, 8)}`}
            autoComplete="new-password"
            readOnly={true}
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: '14px 16px',
              fontSize: '15px',
              borderRadius: '14px',
              background: '#0D0F14',
              border: '1px solid #2E3345',
              color: '#E5E7EB',
              outline: 'none',
              transition: 'all 0.2s ease',
              fontFamily: "'Inter', sans-serif",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLInputElement).style.borderColor = '#4B5563';
            }}
            onMouseLeave={(e) => {
              if (document.activeElement !== e.target) {
                (e.target as HTMLInputElement).style.borderColor = '#2E3345';
              }
            }}
            onFocus={(e) => {
              e.target.removeAttribute('readonly');
              (e.target as HTMLInputElement).style.borderColor = '#7C3AED';
              (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.15)';
            }}
            onBlur={(e) => {
              (e.target as HTMLInputElement).style.borderColor = '#2E3345';
              (e.target as HTMLInputElement).style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          style={{
            padding: '14px',
            fontSize: '15px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '14px',
            cursor: 'pointer',
            marginTop: '10px',
            transition: 'all 0.2s ease',
            fontFamily: "'Inter', sans-serif",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.transform = 'translateY(0)';
          }}
        >
          Sign In
        </button>
      </form>
    </div>
  );
};