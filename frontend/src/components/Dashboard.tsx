import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { Config } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';

/* ────────────────── helpers ────────────────── */
function formatTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function addMinutes(t: string, mins: number): string {
  const [h, m] = t.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

function generateSlots(
  start: string,
  end: string,
  duration: number,
  breaks: { start_time: string, duration_minutes: number }[]
): { start: string; end: string; isBreak: boolean }[] {
  const slots: { start: string; end: string; isBreak: boolean }[] = [];
  let cursor = start;

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const endMin = toMin(end);

  // Sort breaks to apply them chronologically
  const sortedBreaks = [...breaks].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));

  while (toMin(cursor) + duration <= endMin) {
    let nextSlotEnd = addMinutes(cursor, duration);
    let breakHit = false;

    // Check if the current slot overlaps or lands squarely inside any break
    for (const brk of sortedBreaks) {
      const brkStartMin = toMin(brk.start_time);
      const brkEndMin = brkStartMin + brk.duration_minutes;
      const cursorMin = toMin(cursor);

      // If the upcoming class crosses into the break or starts identically
      if (cursorMin < brkStartMin && toMin(nextSlotEnd) > brkStartMin) {
        // We truncate the class (or rather, we don't schedule it because it would cross a break)
        // For simplicity: shift the cursor to the START of the break, so the break is processed next
        cursor = brk.start_time;
        breakHit = true;
        break;
      } else if (cursorMin >= brkStartMin && cursorMin < brkEndMin) {
        // We hit a break!
        const brkEndStr = addMinutes(brk.start_time, brk.duration_minutes);
        slots.push({ start: brk.start_time, end: brkEndStr, isBreak: true });
        // Shift cursor past the break
        cursor = brkEndStr;
        breakHit = true;
        break;
      }
    }

    if (!breakHit) {
      // It's a normal class slot
      if (toMin(nextSlotEnd) <= endMin) {
        slots.push({ start: cursor, end: nextSlotEnd, isBreak: false });
        cursor = nextSlotEnd;
      } else {
        break;
      }
    }
  }
  return slots;
}

/* ─────────────── gradient colors for slot rows ─────────────── */
const SLOT_COLORS = [
  'from-themeSurface/80 to-themeSurface border-themePrimary/30 text-themeTextMain',
  'from-themeSurface/70 to-themeSurface border-themePrimary/40 text-themeTextMain',
];

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { recentConfigs, setConfig, addRecentConfig } = useStore();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    start_time: '08:00',
    end_time: '17:00',
    slot_duration_minutes: 60,
    breaks: [{ id: Date.now(), start_time: '12:00', duration_minutes: 60 }],
  });

  /* Live slot preview */
  const slots = useMemo(
    () =>
      generateSlots(
        formData.start_time,
        formData.end_time,
        formData.slot_duration_minutes,
        formData.breaks
      ),
    [formData]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/config`, formData);
      setConfig(res.data);
      addRecentConfig(res.data);
      navigate('/configure');
    } catch (error: any) {
      console.error(error);
      if (!error.response) {
        alert('Cannot connect to backend server. Make sure the backend is running!');
      } else {
        alert('Failed to create config: ' + (error.response?.data?.detail || 'Unknown error'));
      }
    }
  };

  const handleLoad = (config: Config) => {
    setConfig(config);
    navigate('/configure');
  };

  const handleLoadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const config = JSON.parse(text);
        setConfig(config);
        addRecentConfig(config);
        navigate('/configure');
      } catch {
        alert('Invalid JSON file');
      }
    };
    input.click();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ECE7D1',
        color: '#2F2A1F',
        display: 'flex',
        fontFamily: "'Inter', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Ambient glow orbs ── */}
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          left: '-120px',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(138,118,80,0.12) 0%, transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-100px',
          right: '-100px',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(142,151,125,0.10) 0%, transparent 70%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      {/* ════════════ LEFT SIDEBAR ════════════ */}
      <aside
        style={{
          width: 240,
          minHeight: '100vh',
          padding: '40px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          borderRight: '1px solid #C9BE9A',
          background: '#F4F0DF',
          backdropFilter: 'blur(12px)',
          zIndex: 1,
        }}
      >
        {/* Logo area */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(#8A7650, #756341)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 12px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              animation: 'float 4s ease-in-out infinite',
            }}
          >
            📅
          </div>
          <h1
            style={{
              fontSize: 15,
              fontWeight: 800,
              background: 'linear-gradient(#8A7650, #756341)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            Master
            <br />
            Timetable
          </h1>
        </div>

        {/* New Button */}
        <button
          id="btn-new"
          onClick={() => setShowModal(true)}
          style={{
            width: '100%',
            padding: '16px 0',
            border: 'none',
            borderRadius: 14,
            background: 'linear-gradient(#8A7650, #756341)',
            color: '#ffffffff',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: '0 6px 12px rgba(138,118,80,0.35)',
            transition: 'all 0.2s ease',
            fontFamily: "'Inter', sans-serif",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.transform = 'translateY(-2px)';
            (e.target as HTMLElement).style.boxShadow = '0 4px 12px #8A7650';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.transform = 'translateY(0)';
            (e.target as HTMLElement).style.boxShadow = '0 6px 24px rgba(138,118,80,0.35)';
          }}
        >
          <span style={{ fontSize: 20 }}>✨</span> New Timetable
        </button>

        {/* Load Button */}
        {/* <button
          id="btn-load"
          onClick={handleLoadFile}
          style={{
            width: '100%',
            padding: '16px 0',
            border: '1px solid #DBCEA5',
            borderRadius: 14,
            background: '#F4F0DF',
            color: '#8A7650',
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'all 0.2s ease',
            fontFamily: "'Inter', sans-serif",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = '#DBCEA5';
            (e.target as HTMLElement).style.borderColor = '#8A7650';
            (e.target as HTMLElement).style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = '#DBCEA5';
            (e.target as HTMLElement).style.borderColor = '#DBCEA5';
            (e.target as HTMLElement).style.transform = 'translateY(0)';
          }}
        >
          <span style={{ fontSize: 20 }}>📂</span> Load File
        </button> */}

        {/* Subtle divider and hint */}
        <div style={{ marginTop: 'auto', textAlign: 'center', opacity: 0.35, fontSize: 11, lineHeight: 1.5 }}>
          Load opens file explorer<br />to find a saved <code>.json</code> file
        </div>
      </aside>

      {/* ════════════ MAIN CONTENT ════════════ */}
      <main
        style={{
          flex: 1,
          padding: '48px 56px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1,
          animation: 'fadeIn 0.5s ease',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(#8A7650, #756341)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
            }}
          >
            Recent Saved Timetables
          </h2>
          <p style={{ color: '#5E5642', marginTop: 8, fontSize: 14 }}>
            Pick up where you left off, or start something new.
          </p>
        </div>

        {/* Timetable cards */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            overflowY: 'auto',
            paddingRight: 8,
          }}
        >
          {recentConfigs.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                animation: 'fadeInUp 0.6s ease',
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 20,
                  background: '#F4F0DF',
                  border: '1px solid rgba(138,118,80,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                }}
              >
                📋
              </div>
              <p style={{ color: '#5E5642', fontSize: 16, fontWeight: 500 }}>
                No recent timetables yet
              </p>
              <p style={{ color: '#5E5642', fontSize: 13 }}>
                Click <strong style={{ color: '#8A7650' }}>"New Timetable"</strong> to get started
              </p>
            </div>
          ) : (
            recentConfigs.map((c: Config, i: number) => (
              <div
                key={c.id ?? i}
                onClick={() => handleLoad(c)}
                style={{
                  padding: '20px 24px',
                  borderRadius: 16,
                  background: '#F4F0DF',
                  border: '1px solid #DBCEA5',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.25s ease',
                  animation: `fadeInUp 0.4s ease ${i * 0.08}s both`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#DBCEA5';
                  (e.currentTarget as HTMLElement).style.borderColor = '#8E977D';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#F4F0DF';
                  (e.currentTarget as HTMLElement).style.borderColor = '#DBCEA5';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: `linear-gradient(135deg, ${['#8A7650', '#8E977D', '#8E977D', '#f59e0b', '#ef4444', '#06b6d4'][i % 6]}22, ${['#8A7650', '#8E977D', '#8E977D', '#f59e0b', '#ef4444', '#06b6d4'][i % 6]}11)`,
                      border: `1px solid ${['#8A7650', '#8E977D', '#8E977D', '#f59e0b', '#ef4444', '#06b6d4'][i % 6]}33`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    📅
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#2F2A1F',
                        margin: 0,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {c.name || 'Untitled Timetable'}
                    </h3>
                    <p style={{ fontSize: 12, color: '#5E5642', margin: '4px 0 0' }}>
                      {formatTime12(c.start_time)} – {formatTime12(c.end_time)} &nbsp;|&nbsp; {c.slot_duration_minutes}min slots
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    color: '#8A7650',
                    fontWeight: 600,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  Open <span style={{ fontSize: 18 }}>→</span>
                </span>
              </div>
            ))
          )}
        </div>
      </main>

      {/* ════════════ CREATE MODAL ════════════ */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(43,43,43,0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#F4F0DF',
              border: '1px solid #DBCEA5',
              borderRadius: 24,
              width: '90%',
              maxWidth: 820,
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px #DBCEA5',
              animation: 'slideUp 0.35s ease',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '24px 32px',
                borderBottom: '1px solid #DBCEA5',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #e0e7ff, #8A7650)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.02em',
                }}
              >
                ✦ Create New Timetable
              </h2>
              <button
                id="btn-modal-close"
                onClick={() => setShowModal(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid #DBCEA5',
                  background: '#F4F0DF',
                  color: '#5E5642',
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                  fontFamily: "'Inter', sans-serif",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.15)';
                  (e.target as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)';
                  (e.target as HTMLElement).style.color = '#f87171';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = '#DBCEA5';
                  (e.target as HTMLElement).style.borderColor = '#DBCEA5';
                  (e.target as HTMLElement).style.color = '#5A5A5A';
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body – 2 columns */}
            <form
              onSubmit={handleCreate}
              style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden',
              }}
            >
              {/* LEFT: Form */}
              <div
                style={{
                  flex: 1,
                  padding: '28px 32px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                  overflowY: 'auto',
                }}
              >
                {/* Name */}
                <div>
                  <label style={labelStyle}>Timetable Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Fall Semester 2026"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={inputStyle}
                    onFocus={(e) => {
                      (e.target as HTMLElement).style.borderColor = '#8A7650';
                      (e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(138,118,80,0.1)';
                    }}
                    onBlur={(e) => {
                      (e.target as HTMLElement).style.borderColor = '#DBCEA5';
                      (e.target as HTMLElement).style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* Start / End time row */}
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Start Time</label>
                    <input
                      type="time"
                      required
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>End Time</label>
                    <input
                      type="time"
                      required
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Slot duration */}
                <div>
                  <label style={labelStyle}>Slot Duration</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      required
                      min={10}
                      max={180}
                      value={formData.slot_duration_minutes}
                      onChange={(e) =>
                        setFormData({ ...formData, slot_duration_minutes: parseInt(e.target.value) || 60 })
                      }
                      style={{ ...inputStyle, paddingRight: 42 }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#5E5642',
                        fontSize: 12,
                        fontWeight: 600,
                        pointerEvents: 'none',
                      }}
                    >
                      min
                    </span>
                  </div>
                </div>

                {/* Break section */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: '#F4F0DF',
                    border: '1px solid #DBCEA5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ ...labelStyle, color: '#8A7650', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ☕ Break Times <span style={{ color: '#5E5642', fontWeight: 400, fontSize: 11 }}>(optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, breaks: [...formData.breaks, { id: Date.now(), start_time: '14:00', duration_minutes: 15 }] })}
                      style={{ background: 'rgba(138,118,80,0.15)', color: '#8A7650', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      + Add Break
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {formData.breaks.map((brk, index) => (
                      <div key={brk.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            type="time"
                            value={brk.start_time}
                            onChange={(e) => {
                              const newBreaks = [...formData.breaks];
                              newBreaks[index].start_time = e.target.value;
                              setFormData({ ...formData, breaks: newBreaks });
                            }}
                            style={{ ...inputStyle, background: '#FFFFFF' }}
                          />
                        </div>
                        <span style={{ color: '#5E5642', fontSize: 13, fontWeight: 600 }}>for</span>
                        <div style={{ position: 'relative', width: 100 }}>
                          <select
                            value={brk.duration_minutes}
                            onChange={(e) => {
                              const newBreaks = [...formData.breaks];
                              newBreaks[index].duration_minutes = parseInt(e.target.value);
                              setFormData({ ...formData, breaks: newBreaks });
                            }}
                            style={{ ...inputStyle, background: '#FFFFFF', paddingRight: 10, appearance: 'none', MozAppearance: 'none', WebkitAppearance: 'none' }}
                          >
                            <option value={15}>15 mins</option>
                            <option value={30}>30 mins</option>
                            <option value={45}>45 mins</option>
                            <option value={60}>60 mins</option>
                            <option value={90}>90 mins</option>
                            <option value={120}>120 mins</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newBreaks = formData.breaks.filter(b => b.id !== brk.id);
                            setFormData({ ...formData, breaks: newBreaks });
                          }}
                          style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {formData.breaks.length === 0 && (
                      <div style={{ color: '#5E5642', fontSize: 13, fontStyle: 'italic', padding: '10px 0' }}>No breaks configured</div>
                    )}
                  </div>
                </div>

                {/* Action button */}
                <button
                  id="btn-create"
                  type="submit"
                  style={{
                    marginTop: 'auto',
                    padding: '14px 0',
                    border: 'none',
                    borderRadius: 14,
                    background: 'linear-gradient(#8A7650, #756341)',
                    color: '#2F2A1F',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                    boxShadow: '0 6px 24px rgba(138,118,80,0.35)',
                    transition: 'all 0.2s ease',
                    fontFamily: "'Inter', sans-serif",
                    letterSpacing: '-0.01em',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                    (e.target as HTMLElement).style.boxShadow = '0 10px 32px #8A7650';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.transform = 'translateY(0)';
                    (e.target as HTMLElement).style.boxShadow = '0 6px 24px rgba(138,118,80,0.35)';
                  }}
                >
                  Next →
                </button>
              </div>

              {/* RIGHT: Live Slot Preview */}
              <div
                style={{
                  width: 300,
                  borderLeft: '1px solid #DBCEA5',
                  background: '#ECE7D1',
                  padding: '24px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#5E5642',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginTop: 0,
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#8E977D',
                      display: 'inline-block',
                      animation: 'pulse-glow 2s infinite',
                    }}
                  />
                  Live Slot Preview
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slots.length === 0 ? (
                    <p style={{ color: '#5E5642', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                      Adjust settings to see slots
                    </p>
                  ) : (
                    slots.map((slot, idx) => (
                      <div
                        key={idx}
                        className={SLOT_COLORS[idx % SLOT_COLORS.length]}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 10,
                          borderWidth: 1,
                          borderStyle: 'solid',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: "'Inter', monospace",
                          animation: `fadeInUp 0.3s ease ${idx * 0.03}s both`,
                        }}
                      >
                        <span style={{ color: slot.isBreak ? '#8A7650' : '#2B2B2B' }}>
                          {formatTime12(slot.start)}
                        </span>
                        <span style={{ color: '#5E5642', fontSize: 11 }}>→</span>
                        <span style={{ color: slot.isBreak ? '#8A7650' : '#2B2B2B' }}>
                          {formatTime12(slot.end)}
                        </span>
                        {slot.isBreak && (
                          <span style={{ fontSize: 11, marginLeft: 4 }}>☕</span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {slots.length > 0 && (
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: 16,
                      borderTop: '1px solid #DBCEA5',
                      fontSize: 12,
                      color: '#5E5642',
                      textAlign: 'center',
                    }}
                  >
                    <strong style={{ color: '#a5b4fc' }}>{slots.length}</strong> slots generated
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared styles ─── */
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#5E5642',
  marginBottom: 8,
  letterSpacing: '0.02em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid #C9BE9A',
  background: '#FFFFFF',
  color: '#2F2A1F',
  fontSize: 14,
  fontWeight: 500,
  outline: 'none',
  transition: 'all 0.2s ease',
  fontFamily: "'Inter', sans-serif",
  boxSizing: 'border-box' as const,
};
