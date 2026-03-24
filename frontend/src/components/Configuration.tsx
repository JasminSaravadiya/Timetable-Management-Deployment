import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
// @ts-ignore
import { useSortable } from '@dnd-kit/sortable';
// @ts-ignore
import { CSS } from '@dnd-kit/utilities';
// @ts-ignore
import { useDroppable } from '@dnd-kit/core';

const API_URL = 'http://localhost:8000/api';

/* ═══════════════════════════════════════════════════════
   SHARED STYLES
   ═══════════════════════════════════════════════════════ */
const glassCard: React.CSSProperties = {
  background: '#F4F0DF',
  border: '1px solid #C9BE9A',
  borderRadius: 14,
  boxShadow: '0 3px 10px rgba(0,0,0,0.05)',
  backdropFilter: 'blur(8px)',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #C9BE9A',
  background: '#FFFFFF',
  color: '#2F2A1F',
  fontSize: 13,
  fontWeight: 500,
  outline: 'none',
  transition: 'all 0.2s',
  fontFamily: "'Inter', sans-serif",
  boxSizing: 'border-box' as const,
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 18px',
  border: 'none',
  borderRadius: 8,
  background: 'linear-gradient(#8A7650, #756341)',
  color: '#2F2A1F',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  transition: 'all 0.2s',
  fontFamily: "'Inter', sans-serif",
};
const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid #C9BE9A',
  background: '#F4F0DF',
  color: '#5E5642',
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
  fontFamily: "'Inter', sans-serif",
};

const ACCENT_COLORS = ['#8A7650', '#8E977D', '#8E977D', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

/* ═══════════════════════════════════════════════════════
   MAIN CONFIGURATION COMPONENT
   ═══════════════════════════════════════════════════════ */
// Helper: HH:MM to minutes
const timeToMins = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Helper: minutes to HH:MM
const minsToTime = (mins: number) => {
  if (!mins) return '00:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default function Configuration() {
  const { currentConfig } = useStore();
  const navigate = useNavigate();

  // Data state
  const [branches, setBranches] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  // Selection
  const [selectedSemId, setSelectedSemId] = useState<number | null>(null);
  const [showAllFaculty, setShowAllFaculty] = useState(false);
  const [mappedFaculties, setMappedFaculties] = useState<any[]>([]);

  // Inline edit
  const [editingItem, setEditingItem] = useState<{ type: string; id: number; field: string; value: string } | null>(null);

  // Add modals
  const [addBranchName, setAddBranchName] = useState('');
  const [addSemName, setAddSemName] = useState('');
  const [addSemBranchId, setAddSemBranchId] = useState<number | null>(null);
  const [addFacultyName, setAddFacultyName] = useState('');
  const [addFacultyWorkload, setAddFacultyWorkload] = useState('04:00');
  const [addSubjectName, setAddSubjectName] = useState('');
  const [addSubjectHours, setAddSubjectHours] = useState('4');
  const [addRoomName, setAddRoomName] = useState('');
  const [addRoomCapacity, setAddRoomCapacity] = useState('60');
  const [showAddSem, setShowAddSem] = useState<number | null>(null); // branch id to show add-sem form

  // Tabs & Custom Modal
  const [activeTab, setActiveTab] = useState<'faculty' | 'rooms'>('faculty');
  const [confirmDeleteObj, setConfirmDeleteObj] = useState<{ type: string; id: number } | null>(null);

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /* ─── Data fetching ─── */
  const fetchAll = useCallback(async () => {
    if (!currentConfig?.id) return;
    const [b, s, f, r, sub] = await Promise.all([
      axios.get(`${API_URL}/branches?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/semesters?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/faculties?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/rooms?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/subjects?config_id=${currentConfig.id}`),
    ]);
    setBranches(b.data);
    setSemesters(s.data);
    setFaculties(f.data);
    setRooms(r.data);
    setSubjects(sub.data);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Fetch mapped faculties when semester changes
  useEffect(() => {
    if (selectedSemId) {
      axios.get(`${API_URL}/mappings/faculty/${selectedSemId}`).then(r => setMappedFaculties(r.data));
    } else {
      setMappedFaculties([]);
    }
  }, [selectedSemId]);

  const semSubjects = subjects.filter((s: any) => s.semester_id === selectedSemId);

  /* ─── CRUD helpers ─── */
  const handleAddBranch = async () => {
    if (!addBranchName.trim() || !currentConfig) return;
    try {
      await axios.post(`${API_URL}/branches`, { name: addBranchName.trim(), config_id: currentConfig.id });
      setAddBranchName('');
      fetchAll();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to add branch');
    }
  };

  const handleAddSemester = async (branchId: number) => {
    if (!addSemName.trim() || !currentConfig) return;
    try {
      await axios.post(`${API_URL}/semesters`, { name: addSemName.trim(), branch_id: branchId, config_id: currentConfig.id });
      setAddSemName('');
      setShowAddSem(null);
      fetchAll();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to add semester');
    }
  };

  const handleAddFaculty = async () => {
    if (!addFacultyName.trim() || !currentConfig) return;
    const mins = timeToMins(addFacultyWorkload);
    try {
      await axios.post(`${API_URL}/faculties`, { name: addFacultyName.trim(), weekly_workload_minutes: mins, config_id: currentConfig.id });
      setAddFacultyName('');
      setAddFacultyWorkload('04:00');
      fetchAll();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to add faculty');
    }
  };

  const handleAddSubject = async () => {
    if (!addSubjectName.trim() || !selectedSemId || !currentConfig) return;
    try {
      await axios.post(`${API_URL}/subjects`, { name: addSubjectName.trim(), semester_id: selectedSemId, weekly_hours: parseFloat(addSubjectHours) || 4, config_id: currentConfig.id });
      setAddSubjectName('');
      setAddSubjectHours('4');
      fetchAll();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to add subject');
    }
  };

  const handleAddRoom = async () => {
    if (!addRoomName.trim() || !currentConfig) return;
    try {
      await axios.post(`${API_URL}/rooms`, { name: addRoomName.trim(), capacity: parseInt(addRoomCapacity) || 60, config_id: currentConfig.id });
      setAddRoomName('');
      setAddRoomCapacity('60');
      fetchAll();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to add room');
    }
  };

  const handleDelete = (type: string, id: number) => {
    setConfirmDeleteObj({ type, id });
  };

  const confirmDeletion = async () => {
    if (!confirmDeleteObj) return;
    const { type, id } = confirmDeleteObj;
    try {
      await axios.delete(`${API_URL}/${type}/${id}`);

      // Immutable state updates instead of fetchAll() to prevent UI instability
      if (type === 'branches') {
        const branchSemIds = semesters.filter(s => s.branch_id === id).map(s => s.id);
        setBranches(prev => prev.filter(b => b.id !== id));
        setSemesters(prev => prev.filter(s => s.branch_id !== id));
        setSubjects(prev => prev.filter(sub => !branchSemIds.includes(sub.semester_id)));
        if (selectedSemId && branchSemIds.includes(selectedSemId)) setSelectedSemId(null);
      } else if (type === 'semesters') {
        setSemesters(prev => prev.filter(s => s.id !== id));
        setSubjects(prev => prev.filter(sub => sub.semester_id !== id));
        if (selectedSemId === id) setSelectedSemId(null);
      } else if (type === 'subjects') {
        setSubjects(prev => prev.filter(s => s.id !== id));
      } else if (type === 'faculties') {
        setFaculties(prev => prev.filter(f => f.id !== id));
        setMappedFaculties(prev => prev.filter((f: any) => f.id !== id));
      } else if (type === 'rooms') {
        setRooms(prev => prev.filter(r => r.id !== id));
      }

      setConfirmDeleteObj(null);
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.detail) {
        alert(err.response.data.detail);
      } else {
        alert("Failed to delete item.");
      }
      setConfirmDeleteObj(null);
    }
  };

  const handleUnmapFaculty = async (facultyId: number) => {
    if (!selectedSemId) return;
    await axios.delete(`${API_URL}/mappings/faculty/${selectedSemId}/${facultyId}`);
    setMappedFaculties(prev => prev.filter((f: any) => f.id !== facultyId));
  };

  const handleInlineEdit = async () => {
    if (!editingItem) return;
    const { type, id, field, value } = editingItem;

    try {
      if (type === 'faculties' && field === 'complex') {
        const parsed = JSON.parse(value);
        await axios.put(`${API_URL}/${type}/${id}`, {
          name: parsed.name,
          weekly_workload_minutes: timeToMins(parsed.workload)
        });
      } else if (type === 'faculties' && field === 'ignore_collision') {
        await axios.put(`${API_URL}/${type}/${id}`, { [field]: value === 'true' });
      } else {
        await axios.put(`${API_URL}/${type}/${id}`, { [field]: field === 'weekly_hours' || field === 'capacity' ? parseFloat(value) : value });
      }
      setEditingItem(null);
      fetchAll();
    } catch (error: any) {
      alert(error.response?.data?.detail || `Failed to update ${type}`);
    }
  };

  /* ─── Drag handlers ─── */
  const handleDragStart = (event: any) => setActiveDragId(event.active.id);
  const handleDragEnd = async (event: any) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    // Drop on faculty-assigned zone
    if (over.id === 'faculty-drop-zone' && active.id.startsWith('fac-')) {
      const facId = parseInt(active.id.replace('fac-', ''));
      if (selectedSemId && !mappedFaculties.find((f: any) => f.id === facId)) {
        await axios.post(`${API_URL}/mappings/faculty`, { semester_id: selectedSemId, faculty_id: facId });
        const fac = faculties.find((f: any) => f.id === facId);
        if (fac) setMappedFaculties(prev => [...prev, fac]);
      }
    }

    // Drop on dustbin
    if (over.id === 'dustbin' && active.id.startsWith('fac-')) {
      const facId = parseInt(active.id.replace('fac-', ''));
      handleDelete('faculties', facId);
    }
  };

  const selectedSem = semesters.find((s: any) => s.id === selectedSemId);
  const selectedBranch = selectedSem ? branches.find((b: any) => b.id === selectedSem.branch_id) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', height: '100vh', background: '#ECE7D1', color: '#2F2A1F', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

        {/* ════════════ LEFT PANEL — Branch Tree ════════════ */}
        <div style={{ width: 260, minWidth: 260, borderRight: '1px solid #DBCEA5', background: '#F4F0DF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #DBCEA5' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, background: 'linear-gradient(#8A7650, #756341)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {currentConfig?.name || 'Timetable'}
            </h2>
            <p style={{ color: '#5E5642', fontSize: 11, margin: '4px 0 0' }}>Screen 2 — Config Data</p>
          </div>

          {/* Add Branch */}
          <div style={{ padding: '12px 16px', display: 'flex', gap: 6, borderBottom: '1px solid #DBCEA5' }}>
            <input
              placeholder="Branch name…"
              value={addBranchName}
              onChange={e => setAddBranchName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddBranch()}
              style={{ ...inputStyle, fontSize: 12, padding: '8px 10px' }}
            />
            <button onClick={handleAddBranch} className="btn-primary" style={{ ...iconBtnStyle, background: '', color: '', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>+</button>
          </div>

          {/* Branch → Semester tree */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {branches.map((branch: any, bi: number) => {
              const branchSems = semesters.filter((s: any) => s.branch_id === branch.id);
              const accent = ACCENT_COLORS[bi % ACCENT_COLORS.length];
              return (
                <div key={branch.id} style={{ marginBottom: 8 }}>
                  {/* Branch header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8, background: `${accent}11`, border: `1px solid ${accent}22`, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
                    {editingItem?.type === 'branches' && editingItem.id === branch.id ? (
                      <input autoFocus value={editingItem.value} onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingItem(null); }}
                        onBlur={handleInlineEdit}
                        style={{ ...inputStyle, fontSize: 12, padding: '4px 8px', flexGrow: 1 }} />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#2F2A1F', flexGrow: 1, cursor: 'default' }}>{branch.name}</span>
                    )}
                    <button onClick={() => setEditingItem({ type: 'branches', id: branch.id, field: 'name', value: branch.name })} style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 10, borderColor: 'transparent', background: 'transparent', color: '#5E5642' }} title="Edit">✏️</button>
                    <button onClick={() => handleDelete('branches', branch.id)} style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 10, borderColor: 'transparent', background: 'transparent', color: '#5E5642' }} title="Delete">🗑️</button>
                    <button onClick={() => { setShowAddSem(showAddSem === branch.id ? null : branch.id); setAddSemName(''); }} style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 12, borderColor: 'transparent', background: 'transparent', color: accent }} title="Add Semester">+</button>
                  </div>

                  {/* Add semester inline */}
                  {showAddSem === branch.id && (
                    <div style={{ display: 'flex', gap: 4, padding: '4px 8px 4px 24px', animation: 'fadeInUp 0.2s ease' }}>
                      <input placeholder="Sem name…" value={addSemName} onChange={e => setAddSemName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddSemester(branch.id)}
                        style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }} autoFocus />
                      <button onClick={() => handleAddSemester(branch.id)} style={{ ...iconBtnStyle, width: 24, height: 24, fontSize: 12, background: `${accent}22`, color: accent }}>✓</button>
                    </div>
                  )}

                  {/* Semesters */}
                  {branchSems.map((sem: any) => (
                    <div
                      key={sem.id}
                      onClick={() => setSelectedSemId(sem.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 10px 7px 24px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
                        background: selectedSemId === sem.id ? `${accent}18` : 'transparent',
                        borderLeft: selectedSemId === sem.id ? `3px solid ${accent}` : '3px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      {editingItem?.type === 'semesters' && editingItem.id === sem.id ? (
                        <input autoFocus value={editingItem.value} onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingItem(null); }}
                          onBlur={handleInlineEdit} onClick={e => e.stopPropagation()}
                          style={{ ...inputStyle, fontSize: 11, padding: '3px 6px', flexGrow: 1 }} />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 500, color: selectedSemId === sem.id ? '#2B2B2B' : '#5A5A5A', flexGrow: 1 }}>
                          {branch.name} {sem.name}
                        </span>
                      )}
                      <button onClick={e => { e.stopPropagation(); setEditingItem({ type: 'semesters', id: sem.id, field: 'name', value: sem.name }); }} style={{ ...iconBtnStyle, width: 18, height: 18, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#5E5642', opacity: 0.6 }}>✏️</button>
                      <button onClick={e => { e.stopPropagation(); handleDelete('semesters', sem.id); }} style={{ ...iconBtnStyle, width: 18, height: 18, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#5E5642', opacity: 0.6 }}>🗑️</button>
                    </div>
                  ))}
                </div>
              );
            })}
            {branches.length === 0 && (
              <p style={{ color: '#5E5642', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                Add your first branch above
              </p>
            )}
          </div>

          {/* Next button */}
          <div style={{ padding: '16px', borderTop: '1px solid #DBCEA5' }}>
            <button onClick={() => navigate('/grid')} className="btn-primary" style={{ width: '100%', padding: '12px 0', borderRadius: 12 }}>
              Next →
            </button>
          </div>
        </div>

        {/* ════════════ CENTER PANEL — Subjects + Assigned Faculty ════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedSemId && selectedBranch && selectedSem ? (
            <>
              {/* Semester header */}
              <div style={{ padding: '20px 28px 12px', borderBottom: '1px solid #DBCEA5' }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#2F2A1F' }}>
                  {selectedBranch.name} — {selectedSem.name}
                </h2>
                <p style={{ color: '#5E5642', fontSize: 12, margin: '4px 0 0' }}>Manage subjects and assign faculty</p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', gap: 20 }}>
                {/* ── Subjects Section ── */}
                <div style={{ flex: 1.2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#5E5642', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      📚 Subjects
                    </h3>
                  </div>

                  {/* Subject header row */}
                  <div style={{ display: 'flex', padding: '8px 14px', fontSize: 11, fontWeight: 700, color: '#5E5642', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #DBCEA5' }}>
                    <span style={{ flex: 1 }}>Subject</span>
                    <span style={{ width: 80, textAlign: 'center' }}>Hours</span>
                    <span style={{ width: 60 }}></span>
                  </div>

                  {/* Subject rows */}
                  {semSubjects.map((sub: any, idx: number) => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #DBCEA5', animation: `fadeInUp 0.3s ease ${idx * 0.04}s both` }}>
                      {editingItem?.type === 'subjects' && editingItem.id === sub.id ? (
                        <>
                          <input autoFocus value={editingItem.value} onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingItem(null); }}
                            onBlur={handleInlineEdit}
                            style={{ ...inputStyle, fontSize: 13, padding: '6px 10px', flex: 1, marginRight: 8 }} />
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#2F2A1F' }}>{sub.name}</span>
                          <span style={{ width: 80, textAlign: 'center', fontSize: 13, fontWeight: 600, color: ACCENT_COLORS[idx % ACCENT_COLORS.length] }}>{sub.weekly_hours}h</span>
                          <div style={{ width: 60, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditingItem({ type: 'subjects', id: sub.id, field: 'name', value: sub.name })} style={{ ...iconBtnStyle, width: 24, height: 24, fontSize: 10 }}>✏️</button>
                            <button onClick={() => handleDelete('subjects', sub.id)} style={{ ...iconBtnStyle, width: 24, height: 24, fontSize: 10 }}>🗑️</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add subject row */}
                  <div style={{ display: 'flex', gap: 8, padding: '12px 14px', alignItems: 'center' }}>
                    <input placeholder="Subject name" value={addSubjectName} onChange={e => setAddSubjectName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddSubject()}
                      style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
                    <input placeholder="Hrs" value={addSubjectHours} onChange={e => setAddSubjectHours(e.target.value)} type="number" min="1"
                      style={{ ...inputStyle, width: 60, fontSize: 12, textAlign: 'center' }} />
                    <button onClick={handleAddSubject} className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }}>+ Add</button>
                  </div>

                  {semSubjects.length === 0 && (
                    <p style={{ color: '#5E5642', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No subjects yet — add one above</p>
                  )}
                </div>

                {/* ── Assigned Faculty Section ── */}
                <FacultyDropZone
                  mappedFaculties={mappedFaculties}
                  onUnmap={handleUnmapFaculty}
                  semLabel={`${selectedBranch.name} ${selectedSem.name}`}
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, animation: 'fadeIn 0.4s ease' }}>
              <div style={{ width: 72, height: 72, borderRadius: 18, background: '#F4F0DF', border: '1px solid rgba(138,118,80,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🎯</div>
              <p style={{ color: '#5E5642', fontSize: 15, fontWeight: 600 }}>Select a semester</p>
              <p style={{ color: '#5E5642', fontSize: 12 }}>Choose a branch & semester from the left panel</p>
            </div>
          )}
        </div>

        {/* ════════════ RIGHT PANEL — Faculty & Rooms ════════════ */}
        <div style={{ width: 280, minWidth: 280, borderLeft: '1px solid #DBCEA5', background: '#F4F0DF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ----- TABS HEADER ----- */}
          <div style={{ display: 'flex', borderBottom: '1px solid #DBCEA5' }}>
            <button
              onClick={() => setActiveTab('faculty')}
              style={{ flex: 1, padding: '16px 0', background: activeTab === 'faculty' ? '#DBCEA5' : 'transparent', border: 'none', borderBottom: activeTab === 'faculty' ? '2px solid #8A7650' : '2px solid transparent', color: activeTab === 'faculty' ? '#2B2B2B' : '#5A5A5A', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
              👥 Faculty
            </button>
            <button
              onClick={() => setActiveTab('rooms')}
              style={{ flex: 1, padding: '16px 0', background: activeTab === 'rooms' ? '#DBCEA5' : 'transparent', border: 'none', borderBottom: activeTab === 'rooms' ? '2px solid #8E977D' : '2px solid transparent', color: activeTab === 'rooms' ? '#2B2B2B' : '#5A5A5A', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
              🏢 Rooms
            </button>
          </div>

          {/* ----- FACULTY TAB ----- */}
          {activeTab === 'faculty' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#2F2A1F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Faculty List</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setShowAllFaculty(!showAllFaculty)} style={{ ...iconBtnStyle, fontSize: 10, width: 'auto', padding: '4px 8px', height: 22, color: showAllFaculty ? '#8A7650' : '#5A5A5A' }}>
                    {showAllFaculty ? 'Hide' : 'All'}
                  </button>
                </div>
              </div>

              {/* Add Faculty */}
              <div style={{ padding: '6px 16px', display: 'flex', gap: 6 }}>
                <input placeholder="Faculty name…" value={addFacultyName} onChange={e => setAddFacultyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddFaculty()}
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 10px', flex: 1 }} />
                <input placeholder="HH:MM" value={addFacultyWorkload} onChange={e => setAddFacultyWorkload(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddFaculty()}
                  title="Weekly Workload (HH:MM)"
                  style={{ ...inputStyle, width: 60, fontSize: 12, padding: '6px 4px', textAlign: 'center' }} />
                <button onClick={handleAddFaculty} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30, width: 30, flexShrink: 0 }}>+</button>
              </div>

              {/* Faculty cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {(showAllFaculty ? faculties : faculties.filter((f: any) => !mappedFaculties.find((mf: any) => mf.id === f.id))).map((fac: any, idx: number) => (
                  <DraggableFacultyCard
                    key={fac.id}
                    faculty={fac}
                    idx={idx}
                    editingItem={editingItem}
                    onEdit={() => setEditingItem({ type: 'faculties', id: fac.id, field: 'complex', value: JSON.stringify({ name: fac.name, workload: minsToTime(fac.weekly_workload_minutes) }) })}
                    onEditChange={(val: string) => editingItem && setEditingItem({ ...editingItem, value: val })}
                    onEditSubmit={handleInlineEdit}
                    onEditCancel={() => setEditingItem(null)}
                    onDelete={() => handleDelete('faculties', fac.id)}
                    onToggleCollision={async (newVal: boolean) => {
                      try {
                        await axios.put(`${API_URL}/faculties/${fac.id}`, { ignore_collision: newVal });
                        fetchAll();
                      } catch (err) { }
                    }}
                    isMapped={!!mappedFaculties.find((mf: any) => mf.id === fac.id)}
                  />
                ))}
                {faculties.length === 0 && (
                  <p style={{ color: '#5E5642', fontSize: 11, textAlign: 'center', padding: '16px 0' }}>Add your first faculty</p>
                )}
              </div>
            </div>
          )}

          {/* ----- ROOMS TAB ----- */}
          {activeTab === 'rooms' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 16px 8px' }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#2F2A1F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room List</h3>
              </div>

              {/* Add Room */}
              <div style={{ padding: '6px 16px', display: 'flex', gap: 6 }}>
                <input placeholder="Room #…" value={addRoomName} onChange={e => setAddRoomName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddRoom()}
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 10px', flex: 1 }} />
                <input placeholder="Cap" value={addRoomCapacity} onChange={e => setAddRoomCapacity(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddRoom()} type="number"
                  style={{ ...inputStyle, fontSize: 12, padding: '6px 4px', width: 44, textAlign: 'center' }} title="Capacity" />
                <button onClick={handleAddRoom} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 30, width: 30, flexShrink: 0 }}>+</button>
              </div>

              {/* Room cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {rooms.map((rm: any, idx: number) => (
                  <div key={rm.id} style={{
                    padding: '10px 12px', borderRadius: 8, background: '#F4F0DF', border: '1px solid #C9BE9A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, animation: `fadeInUp 0.3s ease ${idx * 0.04}s both`
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                      🚪
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      {editingItem?.type === 'rooms' && editingItem.id === rm.id ? (
                        <input autoFocus value={editingItem.value} onChange={e => editingItem && setEditingItem({ ...editingItem, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingItem(null); }}
                          onBlur={handleInlineEdit}
                          style={{ ...inputStyle, fontSize: 12, padding: '2px 6px' }} />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#2F2A1F', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rm.name}</span>
                      )}
                      <span style={{ fontSize: 10, color: '#8E977D', fontWeight: 600 }}>Cap: {rm.capacity}</span>
                    </div>
                    <button onClick={() => setEditingItem({ type: 'rooms', id: rm.id, field: 'name', value: rm.name })} style={{ ...iconBtnStyle, width: 20, height: 20, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#5E5642' }}>✏️</button>
                    <button onClick={() => handleDelete('rooms', rm.id)} style={{ ...iconBtnStyle, width: 20, height: 20, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#5E5642' }}>🗑️</button>
                  </div>
                ))}
                {rooms.length === 0 && (
                  <p style={{ color: '#5E5642', fontSize: 11, textAlign: 'center', padding: '16px 0' }}>Add your first room</p>
                )}
              </div>
            </div>
          )}

          {/* Dustbin zone */}
          <DustbinZone isActive={!!activeDragId} />
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragId ? (
            <div style={{ padding: '10px 16px', borderRadius: 12, background: '#F4F0DF', border: '1px solid #C9BE9A', color: '#2F2A1F', fontSize: 13, fontWeight: 700, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', cursor: 'grabbing' }}>
              {faculties.find((f: any) => `fac-${f.id}` === activeDragId)?.name || 'Faculty'}
            </div>
          ) : null}
        </DragOverlay>

        {/* Custom Delete Confirmation Modal */}
        {confirmDeleteObj && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{
              background: '#F4F0DF', border: '1px solid #C9BE9A', padding: 24, borderRadius: 14,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)', width: confirmDeleteObj.type === 'branches' ? 380 : 320, textAlign: confirmDeleteObj.type === 'branches' ? 'left' : 'center', animation: 'fadeInUp 0.2s ease'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#2F2A1F', textAlign: 'center' }}>Confirm Deletion</h3>

              {confirmDeleteObj.type === 'branches' ? (
                <div style={{ background: 'rgba(239,68,68,0.1)', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 24 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#fca5a5', fontWeight: 600 }}>Are you sure you want to delete this branch?</p>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#cbd5e1' }}>Deleting a branch will remove:</p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 12, color: '#5E5642' }}>
                    <li>All semesters inside the branch</li>
                    <li>Subjects under those semesters</li>
                  </ul>
                  <p style={{ margin: 0, fontSize: 12, color: '#f87171', fontWeight: 600 }}>This action cannot be undone.</p>
                </div>
              ) : (
                <p style={{ margin: '0 0 24px', fontSize: 13, color: '#5E5642', textAlign: 'center' }}>Are you sure you want to delete this item?</p>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setConfirmDeleteObj(null)} style={{ flex: 1, padding: '10px 0', background: '#FFFFFF', border: '1px solid #C9BE9A', color: '#2F2A1F', borderRadius: 8, cursor: 'pointer', fontWeight: 600, transition: 'background 0.2s' }}>Cancel</button>
                <button onClick={confirmDeletion} style={{ flex: 1, padding: '10px 0', background: '#e11d48', border: 'none', color: '#2F2A1F', borderRadius: 8, cursor: 'pointer', fontWeight: 600, transition: 'background 0.2s' }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}

/* ═══════════════════════════════════════════════════════
   DRAGGABLE FACULTY CARD
   ═══════════════════════════════════════════════════════ */
function DraggableFacultyCard({ faculty, idx, editingItem, onEdit, onEditChange, onEditSubmit, onEditCancel, onDelete, onToggleCollision, isMapped }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `fac-${faculty.id}` });
  const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];

  return (
    <div
      ref={setNodeRef}
      className="faculty-card"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        padding: '12px 14px',
        borderRadius: 12,
        background: isMapped ? 'rgba(16,185,129,0.06)' : '#DBCEA5',
        border: `1px solid ${isMapped ? 'rgba(16,185,129,0.2)' : '#DBCEA5'}`,
        marginBottom: 6,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: `fadeInUp 0.3s ease ${idx * 0.04}s both`,
      }}
      {...attributes}
      {...listeners}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accent}18`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
        👤
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {editingItem?.type === 'faculties' && editingItem.id === faculty.id ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input autoFocus value={JSON.parse(editingItem.value).name} onChange={e => onEditChange(JSON.stringify({ ...JSON.parse(editingItem.value), name: e.target.value }))}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') onEditSubmit(); if (e.key === 'Escape') onEditCancel(); }}
              onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
              style={{ ...inputStyle, fontSize: 12, padding: '4px 6px', flex: 1 }} />
            <input value={JSON.parse(editingItem.value).workload} onChange={e => onEditChange(JSON.stringify({ ...JSON.parse(editingItem.value), workload: e.target.value }))}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') onEditSubmit(); if (e.key === 'Escape') onEditCancel(); }}
              onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} title="Workload HH:MM"
              style={{ ...inputStyle, fontSize: 11, padding: '4px', width: 44, textAlign: 'center' }} />
          </div>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2F2A1F', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{faculty.name}</span>
            <span style={{ fontSize: 10, color: '#5E5642' }}>Workload: {minsToTime(faculty.weekly_workload_minutes)} (weekly)</span>

            {/* Ignore Collision Toggle */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
            >
              <span style={{ fontSize: 10, color: '#5E5642', fontWeight: 600 }}>Ignore Collision</span>
              <input
                type="checkbox"
                checked={faculty.ignore_collision || false}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onChange={e => {
                  e.stopPropagation();
                  onToggleCollision(e.target.checked);
                }}
                style={{ cursor: 'pointer', width: 14, height: 14 }}
                title="Ignore Collision"
              />
            </div>
          </>
        )}
        {isMapped && <span style={{ fontSize: 10, color: '#8E977D', fontWeight: 600 }}>Mapped ✓</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          onPointerDown={e => e.stopPropagation()}
          style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#5E5642' }}
        >✏️</button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          onPointerDown={e => e.stopPropagation()}
          style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#5E5642' }}
        >🗑️</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FACULTY DROP ZONE (center panel)
   ═══════════════════════════════════════════════════════ */
function FacultyDropZone({ mappedFaculties, onUnmap, semLabel }: { mappedFaculties: any[]; onUnmap: (id: number) => void; semLabel: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'faculty-drop-zone' });

  return (
    <div ref={setNodeRef} style={{
      flex: 0.8,
      ...glassCard,
      borderColor: isOver ? '#8A7650' : '#DBCEA5',
      background: isOver ? '#DBCEA5' : '#DBCEA5',
      padding: 16,
      display: 'flex', flexDirection: 'column',
      transition: 'all 0.2s',
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#5E5642', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        👥 {semLabel} Faculties
      </h3>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {mappedFaculties.map((fac: any, idx: number) => (
          <div key={fac.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
            marginBottom: 6, animation: `fadeInUp 0.3s ease ${idx * 0.05}s both`,
          }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#d1fae5' }}>{fac.name}</span>
              <p style={{ fontSize: 10, color: '#5E5642', margin: '2px 0 0' }}>Remaining Workload</p>
            </div>
            <button onClick={() => onUnmap(fac.id)} style={{ ...iconBtnStyle, width: 24, height: 24, fontSize: 10 }} title="Unmap faculty">✕</button>
          </div>
        ))}
        {mappedFaculties.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
            <span style={{ fontSize: 24 }}>↩️</span>
            <p style={{ color: '#5E5642', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
              Drag faculty from the<br />right panel to assign
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DUSTBIN ZONE
   ═══════════════════════════════════════════════════════ */
function DustbinZone({ isActive }: { isActive: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'dustbin' });

  return (
    <div ref={setNodeRef} style={{
      padding: '16px',
      borderTop: '1px solid #DBCEA5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: isOver ? 'rgba(239,68,68,0.12)' : isActive ? 'rgba(239,68,68,0.04)' : 'transparent',
      transition: 'all 0.2s',
      opacity: isActive ? 1 : 0.3,
    }}>
      <span style={{ fontSize: 20 }}>🗑️</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: isOver ? '#f87171' : '#5A5A5A' }}>
        {isOver ? 'Release to delete' : 'Drop here to delete'}
      </span>
    </div>
  );
}
