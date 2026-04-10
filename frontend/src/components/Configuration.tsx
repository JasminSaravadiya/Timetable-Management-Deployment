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
import { API_URL } from '../config';
import { fetchConfigData, invalidateCache } from '../apiCache';
import { usePendingChanges } from '../store/usePendingChanges';

/* ═══════════════════════════════════════════════════════
   SHARED STYLES
   ═══════════════════════════════════════════════════════ */
const glassCard: React.CSSProperties = {
  background: '#1C1F2A',
  border: '1px solid #2E3345',
  borderRadius: 14,
  boxShadow: '0 3px 10px rgba(0,0,0,0.2)',
  backdropFilter: 'blur(8px)',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #2E3345',
  background: '#242838',
  color: '#E5E7EB',
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
  background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)',
  color: '#0D0F14',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(196,181,253,0.2)',
  transition: 'all 0.2s',
  fontFamily: "'Inter', sans-serif",
};
const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: '1px solid #2E3345',
  background: '#262A36',
  color: '#9CA3AF',
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
  fontFamily: "'Inter', sans-serif",
};

const ACCENT_COLORS = ['#C4B5FD', '#A3E635', '#FDE68A', '#67E8F9', '#F9A8D4', '#6EE7B7', '#93C5FD', '#FCA5A5'];

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
  const { currentConfig, setConfig } = useStore();
  const navigate = useNavigate();
  const { addOp, hasPendingChanges, pendingCount, isFlushing, flushToApi, clearOps } = usePendingChanges();

  // Data state
  const [branches, setBranches] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);

  // Save status after flush
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaved = () => {
    setSaveStatus('saved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
  };
  const showError = () => {
    setSaveStatus('error');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasPendingChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPendingChanges]);

  // Temp ID counter for optimistic inserts (negative to avoid collisions with DB IDs)
  const tempIdCounter = React.useRef(-1);
  const nextTempId = () => tempIdCounter.current--;

  // Selection
  const [selectedSemId, setSelectedSemId] = useState<number | null>(null);
  const [showAllFaculty, setShowAllFaculty] = useState(false);
  const [mappedFaculties, setMappedFaculties] = useState<any[]>([]);

  // Inline edit
  const [editingItem, setEditingItem] = useState<{ type: string; id: number; field: string; value: string } | null>(null);

  // Timetable Renaming
  const [editingConfigName, setEditingConfigName] = useState(false);
  const [configName, setConfigName] = useState(currentConfig?.name || 'Timetable');

  useEffect(() => {
    setConfigName(currentConfig?.name || 'Timetable');
  }, [currentConfig?.name]);

  const saveConfigName = () => {
    if (!currentConfig?.id) return;
    setConfig({ ...currentConfig, name: configName });
    setEditingConfigName(false);
    addOp({ type: 'update', entity: 'branches' as any, entityId: currentConfig.id, data: { name: configName } });
    // Note: config rename is handled inline via direct API call since it's metadata
    axios.put(`${API_URL}/config/${currentConfig.id}`, { name: configName })
      .then(() => invalidateCache())
      .catch((err: any) => {
        const detail = err.response?.data?.detail || err.message || 'Unknown error';
        alert('Failed to rename timetable: ' + detail);
      });
  };

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
  const [deletingItem, setDeletingItem] = useState<{ type: string; id: number } | null>(null);
  const isItemDeleting = (type: string, id: number) => deletingItem?.type === type && deletingItem?.id === id;

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /* ─── Data fetching ─── */
  const fetchAll = useCallback(async () => {
    if (!currentConfig?.id) return;
    const data = await fetchConfigData(currentConfig.id);
    setBranches(data.branches);
    setSemesters(data.semesters);
    setFaculties(data.faculties);
    setRooms(data.rooms);
    setSubjects(data.subjects);
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
  const handleAddBranch = () => {
    const name = addBranchName.trim();
    if (!name || !currentConfig) return;
    if (branches.some((b: any) => b.name.toLowerCase() === name.toLowerCase())) {
      alert('This entry already exists.'); return;
    }
    const tempId = nextTempId();
    setBranches(prev => [...prev, { id: tempId, name, config_id: currentConfig.id }]);
    setAddBranchName('');
    addOp({ type: 'create', entity: 'branches', tempId, data: { name, config_id: currentConfig.id } });
  };

  const handleAddSemester = (branchId: number) => {
    const name = addSemName.trim();
    if (!name || !currentConfig) return;
    if (semesters.some((s: any) => s.branch_id === branchId && s.name.toLowerCase() === name.toLowerCase())) {
      alert('This entry already exists.'); return;
    }
    const tempId = nextTempId();
    setSemesters(prev => [...prev, { id: tempId, name, branch_id: branchId, config_id: currentConfig.id }]);
    setAddSemName(''); setShowAddSem(null);
    addOp({ type: 'create', entity: 'semesters', tempId, data: { name, branch_id: branchId, config_id: currentConfig.id } });
  };

  const handleAddFaculty = () => {
    const name = addFacultyName.trim();
    if (!name || !currentConfig) return;
    if (faculties.some((f: any) => f.name.toLowerCase() === name.toLowerCase())) {
      alert('This entry already exists.'); return;
    }
    const mins = timeToMins(addFacultyWorkload);
    const tempId = nextTempId();
    setFaculties(prev => [...prev, { id: tempId, name, weekly_workload_minutes: mins, config_id: currentConfig.id, ignore_collision: false }]);
    setAddFacultyName(''); setAddFacultyWorkload('04:00');
    addOp({ type: 'create', entity: 'faculties', tempId, data: { name, weekly_workload_minutes: mins, config_id: currentConfig.id } });
  };

  const handleAddSubject = () => {
    const name = addSubjectName.trim();
    if (!name || !selectedSemId || !currentConfig) return;
    if (subjects.some((s: any) => s.semester_id === selectedSemId && s.name.toLowerCase() === name.toLowerCase())) {
      alert('This entry already exists.'); return;
    }
    const hours = parseFloat(addSubjectHours) || 4;
    const tempId = nextTempId();
    setSubjects(prev => [...prev, { id: tempId, name, semester_id: selectedSemId, weekly_hours: hours, config_id: currentConfig.id }]);
    setAddSubjectName(''); setAddSubjectHours('4');
    addOp({ type: 'create', entity: 'subjects', tempId, data: { name, semester_id: selectedSemId, weekly_hours: hours, config_id: currentConfig.id } });
  };

  const handleAddRoom = () => {
    const name = addRoomName.trim();
    if (!name || !currentConfig) return;
    if (rooms.some((r: any) => r.name.toLowerCase() === name.toLowerCase())) {
      alert('This entry already exists.'); return;
    }
    const cap = parseInt(addRoomCapacity) || 60;
    const tempId = nextTempId();
    setRooms(prev => [...prev, { id: tempId, name, capacity: cap, config_id: currentConfig.id }]);
    setAddRoomName(''); setAddRoomCapacity('60');
    addOp({ type: 'create', entity: 'rooms', tempId, data: { name, capacity: cap, config_id: currentConfig.id } });
  };

  const handleDelete = (type: string, id: number) => {
    setConfirmDeleteObj({ type, id });
  };

  const confirmDeletion = async () => {
    if (!confirmDeleteObj) return;
    const { type, id } = confirmDeleteObj;

    // Local state updates — instant UI removal
    if (type === 'branches') {
      const branchSemIds = semesters.filter(s => s.branch_id === id).map(s => s.id);
      setBranches(prev => prev.filter(b => b.id !== id));
      setSemesters(prev => prev.filter(s => s.branch_id !== id));
      setSubjects(prev => prev.filter(sub => !branchSemIds.includes(sub.semester_id)));
      if (selectedSemId && branchSemIds.includes(selectedSemId)) setSelectedSemId(null);
      // Queue delete for branch (and cascaded children will be handled by backend)
      addOp({ type: 'delete', entity: 'branches', entityId: id });
    } else if (type === 'semesters') {
      setSemesters(prev => prev.filter(s => s.id !== id));
      setSubjects(prev => prev.filter(sub => sub.semester_id !== id));
      if (selectedSemId === id) setSelectedSemId(null);
      addOp({ type: 'delete', entity: 'semesters', entityId: id });
    } else if (type === 'subjects') {
      setSubjects(prev => prev.filter(s => s.id !== id));
      addOp({ type: 'delete', entity: 'subjects', entityId: id });
    } else if (type === 'faculties') {
      setFaculties(prev => prev.filter(f => f.id !== id));
      setMappedFaculties(prev => prev.filter((f: any) => f.id !== id));
      addOp({ type: 'delete', entity: 'faculties', entityId: id });
    } else if (type === 'rooms') {
      setRooms(prev => prev.filter(r => r.id !== id));
      addOp({ type: 'delete', entity: 'rooms', entityId: id });
    }

    setConfirmDeleteObj(null);
    setDeletingItem(null);
  };

  const handleUnmapFaculty = (facultyId: number) => {
    if (!selectedSemId) return;
    setMappedFaculties(prev => prev.filter((f: any) => f.id !== facultyId));
    // Only queue delete for real (positive) IDs; for temp items the mapping was never saved
    if (facultyId > 0 && selectedSemId > 0) {
      addOp({ type: 'delete', entity: 'mappings/faculty' as any, entityId: selectedSemId, data: { faculty_id: facultyId } });
    }
  };

  const handleInlineEdit = () => {
    if (!editingItem) return;
    const { type, id, field, value } = editingItem;
    setEditingItem(null); // close editor instantly

    // Apply changes to local state immediately
    const applyUpdate = (list: any[], setList: any) => {
      setList(list.map((item: any) => {
        if (item.id !== id) return item;
        if (type === 'faculties' && field === 'complex') {
          const parsed = JSON.parse(value);
          return { ...item, name: parsed.name, weekly_workload_minutes: timeToMins(parsed.workload) };
        }
        if (field === 'ignore_collision') return { ...item, [field]: value === 'true' };
        if (field === 'weekly_hours' || field === 'capacity') return { ...item, [field]: parseFloat(value) };
        return { ...item, [field]: value };
      }));
    };
    if (type === 'branches') applyUpdate(branches, setBranches);
    else if (type === 'semesters') applyUpdate(semesters, setSemesters);
    else if (type === 'subjects') applyUpdate(subjects, setSubjects);
    else if (type === 'faculties') applyUpdate(faculties, setFaculties);
    else if (type === 'rooms') applyUpdate(rooms, setRooms);

    // Queue update op (only for real IDs; for temp items, the create op already has the latest data)
    let updatePayload: any;
    if (type === 'faculties' && field === 'complex') {
      const parsed = JSON.parse(value);
      updatePayload = { name: parsed.name, weekly_workload_minutes: timeToMins(parsed.workload) };
    } else if (type === 'faculties' && field === 'ignore_collision') {
      updatePayload = { [field]: value === 'true' };
    } else {
      updatePayload = { [field]: field === 'weekly_hours' || field === 'capacity' ? parseFloat(value) : value };
    }

    if (id > 0) {
      addOp({ type: 'update', entity: type as any, entityId: id, data: updatePayload });
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
      if (selectedSemId) {
        const fac = faculties.find((f: any) => f.id === facId);
        if (!fac) return;
        
        // Check if already mapped
        if (mappedFaculties.some((f: any) => f.id === facId)) return;
        
        setMappedFaculties(prev => [...prev, fac]);
        addOp({ type: 'create', entity: 'mappings/faculty', data: { semester_id: selectedSemId, faculty_id: facId } });
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
      <div style={{ display: 'flex', height: '100vh', background: '#0D0F14', color: '#E5E7EB', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

        {/* ════════════ LEFT PANEL — Branch Tree ════════════ */}
        <div style={{ width: 260, minWidth: 260, borderRight: '1px solid #2E3345', background: '#1C1F2A', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #2E3345' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {editingConfigName ? (
                <input
                  autoFocus
                  value={configName}
                  onChange={e => setConfigName(e.target.value)}
                  onBlur={saveConfigName}
                  onKeyDown={e => { if (e.key === 'Enter') saveConfigName(); if (e.key === 'Escape') setEditingConfigName(false); }}
                  style={{ ...inputStyle, fontSize: 16, fontWeight: 800, padding: '4px 8px', margin: 0, width: 'auto', flex: 1 }}
                />
              ) : (
                <h2 
                  onClick={() => setEditingConfigName(true)}
                  title="Click to rename"
                  style={{ margin: 0, fontSize: 16, fontWeight: 800, background: 'linear-gradient(#C4B5FD, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', cursor: 'pointer' }}
                >
                  {currentConfig?.name || 'Timetable'}
                </h2>
              )}
              {/* Unsaved changes indicator */}
              {hasPendingChanges() && (
                <span className="pending-badge" title={`${pendingCount()} unsaved change(s)`}>
                  {pendingCount()}
                </span>
              )}
              {saveStatus !== 'idle' && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                  animation: 'fadeIn 0.2s ease',
                  ...(saveStatus === 'saved' ? { color: '#16a34a', background: 'rgba(22,163,74,0.10)' } :
                      { color: '#ef4444', background: 'rgba(239,68,68,0.10)' })
                }}>
                  {saveStatus === 'saved' ? '✓ Saved' : '✗ Error'}
                </span>
              )}
            </div>
            <p style={{ color: '#9CA3AF', fontSize: 11, margin: '4px 0 0' }}>Screen 2 — Config Data</p>
          </div>

          {/* Add Branch */}
          <div style={{ padding: '12px 16px', display: 'flex', gap: 6, borderBottom: '1px solid #2E3345' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 8, background: `${accent}11`, border: `1px solid ${accent + '22'}`, marginBottom: 4, transition: 'border-color 0.3s' }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: branch.id < 0 ? '#FDE68A' : accent,
                    }} />
                    {editingItem?.type === 'branches' && editingItem.id === branch.id ? (
                      <input autoFocus value={editingItem.value} onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingItem(null); }}
                        onBlur={handleInlineEdit}
                        style={{ ...inputStyle, fontSize: 12, padding: '4px 8px', flexGrow: 1 }} />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#E5E7EB', flexGrow: 1, cursor: 'default' }}>
                        {branch.name}
                        {branch.id < 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#FDE68A', marginLeft: 6 }}>unsaved</span>
                        )}
                      </span>
                    )}
                    <button onClick={() => setEditingItem({ type: 'branches', id: branch.id, field: 'name', value: branch.name })} disabled={isItemDeleting('branches', branch.id)} style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 10, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF', opacity: isItemDeleting('branches', branch.id) ? 0.3 : 1 }} title="Edit">✏️</button>
                    <button onClick={() => handleDelete('branches', branch.id)} disabled={isItemDeleting('branches', branch.id)} style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 10, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF', opacity: isItemDeleting('branches', branch.id) ? 0.3 : 1 }} title="Delete">{isItemDeleting('branches', branch.id) ? <span className="delete-spinner" style={{ width: 12, height: 12 }} /> : '🗑️'}</button>
                    <button
                      onClick={() => {
                        setShowAddSem(showAddSem === branch.id ? null : branch.id);
                        setAddSemName('');
                      }}
                      style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 12, borderColor: 'transparent', background: 'transparent', color: accent, cursor: 'pointer' }}
                      title="Add Semester"
                    >+</button>
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
                        <span style={{ fontSize: 12, fontWeight: 500, color: selectedSemId === sem.id ? '#E5E7EB' : '#9CA3AF', flexGrow: 1 }}>
                          {branch.name} {sem.name}
                        </span>
                      )}
                      <button onClick={e => { e.stopPropagation(); setEditingItem({ type: 'semesters', id: sem.id, field: 'name', value: sem.name }); }} disabled={isItemDeleting('semesters', sem.id)} style={{ ...iconBtnStyle, width: 18, height: 18, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF', opacity: isItemDeleting('semesters', sem.id) ? 0.3 : 0.6 }}>✏️</button>
                      <button onClick={e => { e.stopPropagation(); handleDelete('semesters', sem.id); }} disabled={isItemDeleting('semesters', sem.id)} style={{ ...iconBtnStyle, width: 18, height: 18, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF', opacity: isItemDeleting('semesters', sem.id) ? 0.3 : 0.6 }}>{isItemDeleting('semesters', sem.id) ? <span className="delete-spinner" style={{ width: 10, height: 10 }} /> : '🗑️'}</button>
                    </div>
                  ))}
                </div>
              );
            })}
            {branches.length === 0 && (
              <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                Add your first branch above
              </p>
            )}
          </div>

          {/* Back button + Save All + Next button */}
          <div style={{ padding: '16px', borderTop: '1px solid #2E3345', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Back to Home */}
            <button
              id="btn-back-home"
              onClick={() => {
                if (hasPendingChanges() && !confirm('You have unsaved changes. Leave without saving?')) return;
                navigate('/');
              }}
              style={{
                width: '100%',
                padding: '9px 0',
                borderRadius: 10,
                border: '1px solid #2E3345',
                background: '#262A36',
                color: '#9CA3AF',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
                fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#2E3345';
                (e.currentTarget as HTMLElement).style.color = '#E5E7EB';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#262A36';
                (e.currentTarget as HTMLElement).style.color = '#9CA3AF';
              }}
            >
              ← Back to Home
            </button>

            {/* 💾 Save All — visible when there are pending changes */}
            {hasPendingChanges() && (
              <button
                id="btn-save-all"
                className="save-all-btn"
                disabled={isFlushing}
                onClick={async () => {
                  if (!currentConfig?.id) return;
                  const result = await flushToApi(currentConfig.id);
                  if (result.success) {
                    showSaved();
                    // Refresh data from server to get real IDs
                    invalidateCache();
                    await fetchAll();
                  } else {
                    showError();
                    alert(result.error || 'Some changes failed to save.');
                    // Still refresh to sync whatever did save
                    invalidateCache();
                    await fetchAll();
                  }
                }}
              >
                {isFlushing ? (
                  <><span className="delete-spinner" style={{ width: 14, height: 14 }} /> Saving...</>
                ) : (
                  <>💾 Save All <span className="pending-badge">{pendingCount()}</span></>
                )}
              </button>
            )}

            {/* Next */}
            <button
              id="btn-next-grid"
              onClick={() => {
                if (hasPendingChanges() && !confirm('You have unsaved changes. Continue without saving?')) return;
                navigate('/grid');
              }}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '12px 0',
                borderRadius: 12,
                position: 'relative',
              }}
            >
              Next →
            </button>
          </div>
        </div>

        {/* ════════════ CENTER PANEL — Subjects + Assigned Faculty ════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedSemId && selectedBranch && selectedSem ? (
            <>
              {/* Semester header */}
              <div style={{ padding: '20px 28px 12px', borderBottom: '1px solid #2E3345' }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#E5E7EB' }}>
                  {selectedBranch.name} — {selectedSem.name}
                </h2>
                <p style={{ color: '#9CA3AF', fontSize: 12, margin: '4px 0 0' }}>Manage subjects and assign faculty</p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', gap: 20 }}>
                {/* ── Subjects Section ── */}
                <div style={{ flex: 1.2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      📚 Subjects
                    </h3>
                  </div>

                  {/* Subject header row */}
                  <div style={{ display: 'flex', padding: '8px 14px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2E3345' }}>
                    <span style={{ flex: 1 }}>Subject</span>
                    <span style={{ width: 80, textAlign: 'center' }}>Hours</span>
                    <span style={{ width: 60 }}></span>
                  </div>

                  {/* Subject rows */}
                  {semSubjects.map((sub: any, idx: number) => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #2E3345', animation: `fadeInUp 0.3s ease ${idx * 0.04}s both` }}>
                      {editingItem?.type === 'subjects' && editingItem.id === sub.id ? (
                        <>
                          <input autoFocus value={editingItem.value} onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(); if (e.key === 'Escape') setEditingItem(null); }}
                            onBlur={handleInlineEdit}
                            style={{ ...inputStyle, fontSize: 13, padding: '6px 10px', flex: 1, marginRight: 8 }} />
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#E5E7EB' }}>{sub.name}</span>
                          <span style={{ width: 80, textAlign: 'center', fontSize: 13, fontWeight: 600, color: ACCENT_COLORS[idx % ACCENT_COLORS.length] }}>{sub.weekly_hours}h</span>
                          <div style={{ width: 60, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditingItem({ type: 'subjects', id: sub.id, field: 'name', value: sub.name })} disabled={isItemDeleting('subjects', sub.id)} style={{ ...iconBtnStyle, width: 24, height: 24, fontSize: 10, opacity: isItemDeleting('subjects', sub.id) ? 0.3 : 1 }}>✏️</button>
                            <button onClick={() => handleDelete('subjects', sub.id)} disabled={isItemDeleting('subjects', sub.id)} style={{ ...iconBtnStyle, width: 24, height: 24, fontSize: 10, opacity: isItemDeleting('subjects', sub.id) ? 0.3 : 1 }}>{isItemDeleting('subjects', sub.id) ? <span className="delete-spinner" style={{ width: 12, height: 12 }} /> : '🗑️'}</button>
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
                    <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No subjects yet — add one above</p>
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
              <div style={{ width: 72, height: 72, borderRadius: 18, background: '#1C1F2A', border: '1px solid rgba(197,186,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🎯</div>
              <p style={{ color: '#9CA3AF', fontSize: 15, fontWeight: 600 }}>Select a semester</p>
              <p style={{ color: '#9CA3AF', fontSize: 12 }}>Choose a branch & semester from the left panel</p>
            </div>
          )}
        </div>

        {/* ════════════ RIGHT PANEL — Faculty & Rooms ════════════ */}
        <div style={{ width: 280, minWidth: 280, borderLeft: '1px solid #2E3345', background: '#1C1F2A', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ----- TABS HEADER ----- */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2E3345' }}>
            <button
              onClick={() => setActiveTab('faculty')}
              style={{ flex: 1, padding: '16px 0', background: activeTab === 'faculty' ? '#2E3345' : 'transparent', border: 'none', borderBottom: activeTab === 'faculty' ? '2px solid #C4B5FD' : '2px solid transparent', color: activeTab === 'faculty' ? '#E5E7EB' : '#9CA3AF', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
              👥 Faculty
            </button>
            <button
              onClick={() => setActiveTab('rooms')}
              style={{ flex: 1, padding: '16px 0', background: activeTab === 'rooms' ? '#2E3345' : 'transparent', border: 'none', borderBottom: activeTab === 'rooms' ? '2px solid #2E3345' : '2px solid transparent', color: activeTab === 'rooms' ? '#E5E7EB' : '#9CA3AF', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
              🏢 Rooms
            </button>
          </div>

          {/* ----- FACULTY TAB ----- */}
          {activeTab === 'faculty' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#E5E7EB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Faculty List</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setShowAllFaculty(!showAllFaculty)} style={{ ...iconBtnStyle, fontSize: 10, width: 'auto', padding: '4px 8px', height: 22, color: showAllFaculty ? '#C4B5FD' : '#9CA3AF' }}>
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
                {[...(showAllFaculty ? faculties : faculties.filter((f: any) => !mappedFaculties.find((mf: any) => mf.id === f.id)))]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((fac: any, idx: number) => (
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
                    onToggleCollision={(newVal: boolean) => {
                      setFaculties(prev => prev.map(f => f.id === fac.id ? { ...f, ignore_collision: newVal } : f));
                      if (fac.id > 0) {
                        addOp({ type: 'update', entity: 'faculties', entityId: fac.id, data: { ignore_collision: newVal } });
                      }
                    }}
                    isMapped={!!mappedFaculties.find((mf: any) => mf.id === fac.id)}
                    isDeleting={isItemDeleting('faculties', fac.id)}
                  />
                ))}
                {faculties.length === 0 && (
                  <p style={{ color: '#9CA3AF', fontSize: 11, textAlign: 'center', padding: '16px 0' }}>Add your first faculty</p>
                )}
              </div>
            </div>
          )}

          {/* ----- ROOMS TAB ----- */}
          {activeTab === 'rooms' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 16px 8px' }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#E5E7EB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room List</h3>
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
                {[...rooms].sort((a, b) => a.name.localeCompare(b.name)).map((rm: any, idx: number) => (
                  <div key={rm.id} style={{
                    padding: '10px 12px', borderRadius: 8, background: '#1C1F2A', border: '1px solid #2E3345', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, animation: `fadeInUp 0.3s ease ${idx * 0.04}s both`
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#E5E7EB', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rm.name}</span>
                      )}
                      <span style={{ fontSize: 10, color: '#2E3345', fontWeight: 600 }}>Cap: {rm.capacity}</span>
                    </div>
                    <button onClick={() => setEditingItem({ type: 'rooms', id: rm.id, field: 'name', value: rm.name })} disabled={isItemDeleting('rooms', rm.id)} style={{ ...iconBtnStyle, width: 20, height: 20, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF', opacity: isItemDeleting('rooms', rm.id) ? 0.3 : 1 }}>✏️</button>
                    <button onClick={() => handleDelete('rooms', rm.id)} disabled={isItemDeleting('rooms', rm.id)} style={{ ...iconBtnStyle, width: 20, height: 20, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF', opacity: isItemDeleting('rooms', rm.id) ? 0.3 : 1 }}>{isItemDeleting('rooms', rm.id) ? <span className="delete-spinner" style={{ width: 10, height: 10 }} /> : '🗑️'}</button>
                  </div>
                ))}
                {rooms.length === 0 && (
                  <p style={{ color: '#9CA3AF', fontSize: 11, textAlign: 'center', padding: '16px 0' }}>Add your first room</p>
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
            <div style={{ padding: '10px 16px', borderRadius: 12, background: '#1C1F2A', border: '1px solid #2E3345', color: '#E5E7EB', fontSize: 13, fontWeight: 700, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', cursor: 'grabbing' }}>
              {faculties.find((f: any) => `fac-${f.id}` === activeDragId)?.name || 'Faculty'}
            </div>
          ) : null}
        </DragOverlay>

        {/* Custom Delete Confirmation Modal */}
        {confirmDeleteObj && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{
              background: '#1C1F2A', border: '1px solid #2E3345', padding: 24, borderRadius: 14,
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)', width: confirmDeleteObj.type === 'branches' ? 380 : 320, textAlign: confirmDeleteObj.type === 'branches' ? 'left' : 'center', animation: 'fadeInUp 0.2s ease'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#E5E7EB', textAlign: 'center' }}>Confirm Deletion</h3>

              {confirmDeleteObj.type === 'branches' ? (
                <div style={{ background: 'rgba(239,68,68,0.1)', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 24 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#fca5a5', fontWeight: 600 }}>Are you sure you want to delete this branch?</p>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#cbd5e1' }}>Deleting a branch will remove:</p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 12, color: '#9CA3AF' }}>
                    <li>All semesters inside the branch</li>
                    <li>Subjects under those semesters</li>
                  </ul>
                  <p style={{ margin: 0, fontSize: 12, color: '#f87171', fontWeight: 600 }}>This action cannot be undone.</p>
                </div>
              ) : (
                <p style={{ margin: '0 0 24px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>Are you sure you want to delete this item?</p>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setConfirmDeleteObj(null)} disabled={!!deletingItem} style={{ flex: 1, padding: '10px 0', background: '#242838', border: '1px solid #2E3345', color: '#E5E7EB', borderRadius: 8, cursor: deletingItem ? 'not-allowed' : 'pointer', fontWeight: 600, transition: 'all 0.2s', opacity: deletingItem ? 0.5 : 1 }}>Cancel</button>
                <button onClick={confirmDeletion} disabled={!!deletingItem} style={{ flex: 1, padding: '10px 0', background: deletingItem ? '#9f1239' : '#e11d48', border: 'none', color: '#E5E7EB', borderRadius: 8, cursor: deletingItem ? 'not-allowed' : 'pointer', fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {deletingItem && <span className="delete-spinner" />}
                  {deletingItem ? 'Deleting...' : 'Delete'}
                </button>
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
function DraggableFacultyCard({ faculty, idx, editingItem, onEdit, onEditChange, onEditSubmit, onEditCancel, onDelete, onToggleCollision, isMapped, isDeleting }: any) {
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
        background: isMapped ? 'rgba(16,185,129,0.06)' : '#2E3345',
        border: `1px solid ${isMapped ? 'rgba(16,185,129,0.2)' : '#2E3345'}`,
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
            <span style={{ fontSize: 13, fontWeight: 700, color: '#E5E7EB', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{faculty.name}</span>
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>Workload: {minsToTime(faculty.weekly_workload_minutes)} (weekly)</span>

            {/* Ignore Collision Toggle */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
            >
              <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>Ignore Collision</span>
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
        {isMapped && <span style={{ fontSize: 10, color: '#2E3345', fontWeight: 600 }}>Mapped ✓</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          onPointerDown={e => e.stopPropagation()}
          style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF' }}
        >✏️</button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          onPointerDown={e => e.stopPropagation()}
          disabled={isDeleting}
          style={{ ...iconBtnStyle, width: 22, height: 22, fontSize: 9, borderColor: 'transparent', background: 'transparent', color: '#9CA3AF', opacity: isDeleting ? 0.3 : 1 }}
        >{isDeleting ? <span className="delete-spinner" style={{ width: 12, height: 12 }} /> : '🗑️'}</button>
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
      borderColor: isOver ? '#C4B5FD' : '#2E3345',
      background: isOver ? '#2E3345' : '#2E3345',
      padding: 16,
      display: 'flex', flexDirection: 'column',
      transition: 'all 0.2s',
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
              <span style={{ fontSize: 13, fontWeight: 700, color: '#A3E635' }}>{fac.name}</span>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>Remaining Workload</p>
            </div>
            <button onClick={() => onUnmap(fac.id)} style={{ ...iconBtnStyle, width: 24, height: 24, fontSize: 10 }} title="Unmap faculty">✕</button>
          </div>
        ))}
        {mappedFaculties.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
            <span style={{ fontSize: 24 }}>↩️</span>
            <p style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
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
      borderTop: '1px solid #2E3345',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: isOver ? 'rgba(239,68,68,0.12)' : isActive ? 'rgba(239,68,68,0.04)' : 'transparent',
      transition: 'all 0.2s',
      opacity: isActive ? 1 : 0.3,
    }}>
      <span style={{ fontSize: 20 }}>🗑️</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: isOver ? '#f87171' : '#9CA3AF' }}>
        {isOver ? 'Release to delete' : 'Drop here to delete'}
      </span>
    </div>
  );
}
