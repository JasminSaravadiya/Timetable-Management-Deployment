import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { Config } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';
import { invalidateCache } from '../apiCache';
import { useLoading } from '../contexts/LoadingContext';

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
  const { setConfig } = useStore();
  const navigate = useNavigate();
  const { withLoading } = useLoading();
  const [showModal, setShowModal] = useState(false);
  const [allConfigs, setAllConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    start_time: '08:00',
    end_time: '17:00',
    slot_duration_minutes: 60,
    breaks: [{ id: Date.now(), start_time: '12:00', duration_minutes: 60 }],
  });

  // Fetch all configs from backend database
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/config`);
      setAllConfigs(res.data);
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount + poll every 15 seconds
  useEffect(() => {
    fetchConfigs();
    const interval = setInterval(fetchConfigs, 15000);
    return () => clearInterval(interval);
  }, [fetchConfigs]);

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
      await withLoading(async () => {
        const res = await axios.post(`${API_URL}/config`, formData);
        setConfig(res.data);
        invalidateCache();
        await fetchConfigs();
        navigate('/configure');
      }, 'Creating timetable...');
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

  const handleDeleteTimetable = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // prevent card click from firing
    if (!window.confirm('Are you sure you want to delete this timetable and ALL its data? This cannot be undone.')) return;
    try {
      await withLoading(async () => {
        await axios.delete(`${API_URL}/config/${id}`);
        invalidateCache();
        setAllConfigs(prev => prev.filter(c => c.id !== id));
      }, 'Deleting timetable...');
    } catch (err: any) {
      console.error('[Delete timetable error]', err);
      const status = err.response?.status;
      const detail = err.response?.data?.detail || err.message || 'Unknown error';
      if (status === 404) {
        alert(`Delete failed (404): The timetable was not found. It may have already been deleted, or the backend needs to be restarted to load the new delete endpoint.\n\nDetail: ${detail}`);
      } else {
        alert(`Failed to delete timetable (HTTP ${status ?? 'no response'}): ${detail}`);
      }
    }
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
        navigate('/configure');
      } catch {
        alert('Invalid JSON file');
      }
    };
    input.click();
  };

  /* Timetable card accent colors */
  const CARD_ACCENTS = ['#C4B5FD', '#A3E635', '#67E8F9', '#FDE68A', '#F9A8D4', '#6EE7B7'];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0D0F14',
        color: '#E5E7EB',
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
          background: 'radial-gradient(circle, rgba(196,181,253,0.08) 0%, transparent 70%)',
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
          background: 'radial-gradient(circle, rgba(103,232,249,0.06) 0%, transparent 70%)',
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
          borderRight: '1px solid #2E3345',
          background: '#1C1F2A',
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
              background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 12px',
              boxShadow: '0 2px 12px rgba(196,181,253,0.3)',
              animation: 'float 4s ease-in-out infinite',
            }}
          >
            📅
          </div>
          <h1
            style={{
              fontSize: 15,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
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
            background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
            color: '#0D0F14',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: '0 6px 20px rgba(196,181,253,0.25)',
            transition: 'all 0.2s ease',
            fontFamily: "'Inter', sans-serif",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.transform = 'translateY(-2px)';
            (e.target as HTMLElement).style.boxShadow = '0 8px 28px rgba(196,181,253,0.4)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.transform = 'translateY(0)';
            (e.target as HTMLElement).style.boxShadow = '0 6px 20px rgba(196,181,253,0.25)';
          }}
        >
          <span style={{ fontSize: 20 }}>✨</span> New Timetable
        </button>

        {/* Subtle divider and hint */}
        <div style={{ marginTop: 'auto', textAlign: 'center', opacity: 0.35, fontSize: 11, lineHeight: 1.5, color: '#9CA3AF' }}>
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
              background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
            }}
          >
            Recent Saved Timetables
          </h2>
          <p style={{ color: '#9CA3AF', marginTop: 8, fontSize: 14 }}>
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
          {loading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <p style={{ color: '#9CA3AF', fontSize: 14 }}>Loading timetables...</p>
            </div>
          ) : allConfigs.length === 0 ? (
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
                  background: '#1C1F2A',
                  border: '1px solid #2E3345',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                }}
              >
                📋
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 16, fontWeight: 500 }}>
                No timetables yet
              </p>
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>
                Click <strong style={{ color: '#C4B5FD' }}>"New Timetable"</strong> to get started
              </p>
            </div>
          ) : (
            allConfigs.map((c: Config, i: number) => (
              <div
                key={c.id ?? i}
                onClick={() => handleLoad(c)}
                style={{
                  padding: '20px 24px',
                  borderRadius: 16,
                  background: '#1C1F2A',
                  border: '1px solid #2E3345',
                  borderLeft: `3px solid ${CARD_ACCENTS[i % CARD_ACCENTS.length]}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.25s ease',
                  animation: `fadeInUp 0.4s ease ${i * 0.08}s both`,
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#262A36';
                  (e.currentTarget as HTMLElement).style.borderColor = '#3E4455';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#1C1F2A';
                  (e.currentTarget as HTMLElement).style.borderColor = '#2E3345';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: `${CARD_ACCENTS[i % CARD_ACCENTS.length]}15`,
                      border: `1px solid ${CARD_ACCENTS[i % CARD_ACCENTS.length]}30`,
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
                        color: '#E5E7EB',
                        margin: 0,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {c.name || 'Untitled Timetable'}
                    </h3>
                    <p style={{ fontSize: 12, color: '#9CA3AF', margin: '4px 0 0' }}>
                      {formatTime12(c.start_time)} – {formatTime12(c.end_time)} &nbsp;|&nbsp; {c.slot_duration_minutes}min slots
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Delete button */}
                  <button
                    id={`btn-delete-${c.id}`}
                    onClick={(e) => handleDeleteTimetable(e, c.id!)}
                    title="Delete timetable"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      border: '1px solid rgba(239,68,68,0.25)',
                      background: 'rgba(239,68,68,0.08)',
                      color: '#f87171',
                      fontSize: 15,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.2)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.5)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.25)';
                    }}
                  >
                    🗑
                  </button>
                  <span
                    style={{
                      color: '#C4B5FD',
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
            background: 'rgba(0,0,0,0.7)',
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
              background: '#1C1F2A',
              border: '1px solid #2E3345',
              borderRadius: 24,
              width: '90%',
              maxWidth: 820,
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px #2E3345',
              animation: 'slideUp 0.35s ease',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '24px 32px',
                borderBottom: '1px solid #2E3345',
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
                  background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
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
                  border: '1px solid #2E3345',
                  background: '#262A36',
                  color: '#9CA3AF',
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
                  (e.target as HTMLElement).style.background = '#262A36';
                  (e.target as HTMLElement).style.borderColor = '#2E3345';
                  (e.target as HTMLElement).style.color = '#9CA3AF';
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
                      (e.target as HTMLElement).style.borderColor = '#C4B5FD';
                      (e.target as HTMLElement).style.boxShadow = '0 0 0 3px rgba(196,181,253,0.1)';
                    }}
                    onBlur={(e) => {
                      (e.target as HTMLElement).style.borderColor = '#2E3345';
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
                        color: '#9CA3AF',
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
                    background: '#262A36',
                    border: '1px solid #2E3345',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ ...labelStyle, color: '#FDE68A', display: 'flex', alignItems: 'center', gap: 6 }}>
                      ☕ Break Times <span style={{ color: '#9CA3AF', fontWeight: 400, fontSize: 11 }}>(optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, breaks: [...formData.breaks, { id: Date.now(), start_time: '14:00', duration_minutes: 15 }] })}
                      style={{ background: 'rgba(196,181,253,0.12)', color: '#C4B5FD', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
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
                            style={{ ...inputStyle, background: '#1C1F2A' }}
                          />
                        </div>
                        <span style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 600 }}>for</span>
                        <div style={{ position: 'relative', width: 100 }}>
                          <select
                            value={brk.duration_minutes}
                            onChange={(e) => {
                              const newBreaks = [...formData.breaks];
                              newBreaks[index].duration_minutes = parseInt(e.target.value);
                              setFormData({ ...formData, breaks: newBreaks });
                            }}
                            style={{ ...inputStyle, background: '#1C1F2A', paddingRight: 10, appearance: 'none', MozAppearance: 'none', WebkitAppearance: 'none' }}
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
                      <div style={{ color: '#9CA3AF', fontSize: 13, fontStyle: 'italic', padding: '10px 0' }}>No breaks configured</div>
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
                    background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
                    color: '#0D0F14',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                    boxShadow: '0 6px 24px rgba(196,181,253,0.25)',
                    transition: 'all 0.2s ease',
                    fontFamily: "'Inter', sans-serif",
                    letterSpacing: '-0.01em',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.transform = 'translateY(-2px)';
                    (e.target as HTMLElement).style.boxShadow = '0 10px 32px rgba(196,181,253,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.transform = 'translateY(0)';
                    (e.target as HTMLElement).style.boxShadow = '0 6px 24px rgba(196,181,253,0.25)';
                  }}
                >
                  Next →
                </button>
              </div>

              {/* RIGHT: Live Slot Preview */}
              <div
                style={{
                  width: 300,
                  minWidth: 300,
                  borderLeft: '1px solid #2E3345',
                  background: '#0D0F14',
                  padding: '24px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  overflowX: 'auto',
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#9CA3AF',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginTop: 0,
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#A3E635',
                      display: 'inline-block',
                      animation: 'pulse-glow 2s infinite',
                    }}
                  />
                  Live Slot Preview
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                  {slots.length === 0 ? (
                    <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
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
                          whiteSpace: 'nowrap',
                          minWidth: 200,
                        }}
                      >
                        <span style={{ color: slot.isBreak ? '#FDE68A' : '#E5E7EB' }}>
                          {formatTime12(slot.start)}
                        </span>
                        <span style={{ color: '#9CA3AF', fontSize: 11, margin: '0 8px' }}>→</span>
                        <span style={{ color: slot.isBreak ? '#FDE68A' : '#E5E7EB' }}>
                          {formatTime12(slot.end)}
                        </span>
                        {slot.isBreak && (
                          <span style={{ fontSize: 11, marginLeft: 8 }}>☕</span>
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
                      borderTop: '1px solid #2E3345',
                      fontSize: 12,
                      color: '#9CA3AF',
                      textAlign: 'center',
                    }}
                  >
                    <strong style={{ color: '#C4B5FD' }}>{slots.length}</strong> slots generated
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
  color: '#9CA3AF',
  marginBottom: 8,
  letterSpacing: '0.02em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 8,
  border: '1px solid #2E3345',
  background: '#242838',
  color: '#E5E7EB',
  fontSize: 14,
  fontWeight: 500,
  outline: 'none',
  transition: 'all 0.2s ease',
  fontFamily: "'Inter', sans-serif",
  boxSizing: 'border-box' as const,
};
