import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { parse, addMinutes, isBefore, format } from 'date-fns';
import ExportPopup from './ExportPopup';
import { API_URL } from '../config';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function MasterGrid() {
  const { currentConfig } = useStore();
  const navigate = useNavigate();

  const [branches, setBranches] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [allocations, setAllocations] = useState([]);

  const [subjects, setSubjects] = useState([]); // Global fetch for dropdowns
  const [faculties, setFaculties] = useState([]);
  const [rooms, setRooms] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ day: string, time: string, semId: number, allocationId?: number } | null>(null);
  const [showExportPopup, setShowExportPopup] = useState(false);

  useEffect(() => {
    if (!currentConfig) navigate('/');
    fetchBaseData();
    fetchAllocations();
  }, [currentConfig]);

  const fetchBaseData = async () => {
    if (!currentConfig?.id) return;
    const [b, s, sub, fac, rm] = await Promise.all([
      axios.get(`${API_URL}/branches?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/semesters?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/subjects?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/faculties?config_id=${currentConfig.id}`),
      axios.get(`${API_URL}/rooms?config_id=${currentConfig.id}`)
    ]);
    setBranches(b.data);
    setSemesters(s.data);
    setSubjects(sub.data);
    setFaculties(fac.data);
    setRooms(rm.data);
  };

  const fetchAllocations = async () => {
    const res = await axios.get(`${API_URL}/allocations`);
    setAllocations(res.data.filter((a: any) => a.config_id === currentConfig?.id));
  };

  // Generate Y-Axis Timeslots incorporating Breaks
  const generateTimeslots = () => {
    if (!currentConfig) return [];
    const slots = [];
    const breaks = currentConfig.breaks || [];

    const start = parse(currentConfig.start_time, 'HH:mm:ss', new Date());
    const end = parse(currentConfig.end_time, 'HH:mm:ss', new Date());
    let current = start;

    while (isBefore(current, end)) {
      const currentStr = format(current, 'HH:mm:ss');
      const overlappingBreak = breaks.find((b: any) => b.start_time === currentStr);

      if (overlappingBreak) {
        const breakDuration = overlappingBreak.duration_minutes;
        const breakEnd = addMinutes(current, breakDuration);
        slots.push({
          type: 'break',
          start: currentStr,
          end: format(breakEnd, 'HH:mm:ss'),
          display: 'Break',
          duration_minutes: breakDuration
        });
        current = breakEnd;
      } else {
        const slotEnd = addMinutes(current, currentConfig.slot_duration_minutes);
        slots.push({
          type: 'slot',
          start: currentStr,
          end: format(slotEnd, 'HH:mm:ss'),
          display: `${format(current, 'HH:mm')} - ${format(slotEnd, 'HH:mm')}`,
          duration_minutes: currentConfig.slot_duration_minutes
        });
        current = slotEnd;
      }
    }
    return slots;
  };
  const timeslots = generateTimeslots();

  // Find allocation helper
  const getAllocationsForCell = (day: string, time: string, semId: number) => {
    return allocations.filter((a: any) => a.day_of_week === day && a.start_time === time && a.semester_id === semId);
  };

  const handleCellClick = (day: string, time: string, semId: number) => {
    setSelectedCell({ day, time, semId });
    setIsModalOpen(true);
  };

  const handleDeleteAllocation = async (id: number) => {
    if (!confirm('Remove this allocation?')) return;
    await axios.delete(`${API_URL}/allocations/${id}`);
    fetchAllocations();
  };

  return (
    <div className="flex flex-col h-screen bg-[#ECE7D1] text-themeTextMain overflow-hidden">
      {/* Header Bar */}
      <div className="bg-[#F4F0DF] p-4 border-b border-[#B8AC86] flex justify-between items-center shadow-lg z-10">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-wide">
            {currentConfig?.name}
          </h1>
          <p className="text-sm text-themeTextMuted">
            {currentConfig?.start_time} - {currentConfig?.end_time} • {currentConfig?.slot_duration_minutes}m slots
          </p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => navigate('/configure')} className="btn-primary">⚙ Data</button>
          <button onClick={() => setShowExportPopup(true)} className="btn-primary">Export &rarr;</button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto relative p-4 custom-scrollbar">
        <div className="inline-block min-w-full rounded-2xl border border-[#B8AC86] bg-[#F4F0DF] backdrop-blur-sm overflow-hidden shadow-2xl">

          <table className="w-full border-collapse border border-[#B8AC86]">
            {/* Table Header: Branches and Semesters */}
            <thead className="bg-[#DBCEA5] border-b border-[#B8AC86] sticky top-0 z-20">
              <tr>
                <th className="border-r border-[#B8AC86] p-3 min-w-[60px] bg-[#DBCEA5] z-30 sticky left-0 shadow-sm" rowSpan={2}>Day</th>
                <th className="border-r border-[#B8AC86] p-3 min-w-[120px] bg-[#DBCEA5] z-30 sticky left-[60px] shadow-sm" rowSpan={2}>Time</th>
                {branches.map((b: any) => {
                  const sems = semesters.filter((s: any) => s.branch_id === b.id);
                  if (sems.length === 0) return null;
                  return (
                    <th key={b.id} colSpan={sems.length} className="border-r border-[#B8AC86] p-3 text-center font-bold text-[#2F2A1F] uppercase tracking-widest text-sm bg-[#DBCEA5]">
                      {b.name}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {branches.map((b: any) => {
                  const sems = semesters.filter((s: any) => s.branch_id === b.id);
                  return sems.map((s: any) => (
                    <th key={s.id} className="border-r border-[#B8AC86] p-2 text-center text-sm font-semibold text-[#2F2A1F] bg-[#DBCEA5] min-w-[200px]">
                      {s.name}
                    </th>
                  ));
                })}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {DAYS.map((day) => {
                const daySlots = timeslots;
                const totalSems = semesters.length;
                const coveredCells = new Set<string>();

                return (
                  <React.Fragment key={day}>
                    {/* Timeslot Rows */}
                    {daySlots.map((timeObj: any, timeIndex: number) => {
                      const time = timeObj.start;
                      const isFirstSlotOfDay = timeIndex === 0;

                      return (
                        <tr key={`${day}-${time}`} className="group transition">
                          {isFirstSlotOfDay && (
                            <td
                              rowSpan={daySlots.length}
                              className="bg-[#DBCEA5] p-2 font-semibold text-[#5E5642] sticky left-0 z-20 border border-[#B8AC86] shadow-[1px_0_0_0_#334155] w-[60px] text-center"
                            >
                              <div className="flex items-center justify-center w-full h-full align-middle tracking-[2px] transform -rotate-180" style={{ writingMode: 'vertical-rl' }}>
                                {day.toUpperCase()}
                              </div>
                            </td>
                          )}
                          <td className="border border-[#B8AC86] p-3 text-xs font-semibold text-[#5E5642] sticky left-[60px] bg-[#DBCEA5] z-20 whitespace-nowrap text-center shadow-[1px_0_0_0_#334155]">
                            {timeObj.display}
                          </td>

                          {/* If it's a Break Slot */}
                          {timeObj.type === 'break' && (
                            <td colSpan={totalSems} className="border border-[#B8AC86] bg-[#F4F0DF] p-2 text-center text-themeTextMuted font-bold tracking-[0.5em] uppercase text-sm h-[60px] relative overflow-hidden">
                              <div className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,'#DBCEA5'_10px,'#DBCEA5'_20px)]">
                                --------- BREAK ---------
                              </div>
                            </td>
                          )}

                          {/* If it's a Normal Slot */}
                          {timeObj.type === 'slot' && branches.map((b: any) => {
                            const sems = semesters.filter((s: any) => s.branch_id === b.id);
                            return sems.map((s: any) => {
                              const cellKey = `${s.id}-${timeIndex}`;
                              if (coveredCells.has(cellKey)) {
                                return null; // Skip rendering this cell since it's spanned over
                              }

                              const cellAllocs = getAllocationsForCell(day, time, s.id);

                              // Calculate max rowSpan based on all allocations in this cell
                              let maxSpan = 1;
                              if (cellAllocs.length > 0 && currentConfig?.slot_duration_minutes) {
                                const maxDuration = Math.max(...cellAllocs.map((a: any) => a.duration_minutes));
                                maxSpan = Math.max(1, Math.ceil(maxDuration / currentConfig.slot_duration_minutes));
                              }

                              // Mark future cells as covered - considering breaks logic too, assuming allocations don't cross breaks generally
                              if (maxSpan > 1) {
                                for (let i = 1; i < maxSpan; i++) {
                                  coveredCells.add(`${s.id}-${timeIndex + i}`);
                                }
                              }

                              return (
                                <td
                                  key={`${day}-${time}-${s.id}`}
                                  rowSpan={maxSpan}
                                  className="border border-[#B8AC86] p-2 relative min-h-[80px] cursor-pointer bg-[#F4F0DF] hover:bg-[#E6DEC4] transition-colors duration-200 align-top"
                                  onClick={() => handleCellClick(day, time, s.id)}
                                >
                                  <div className="flex flex-col gap-1 w-full h-full">
                                    {cellAllocs.length === 0 ? (
                                      <div className="w-full h-full min-h-[60px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-themeTextMuted font-bold text-xl">+</span>
                                      </div>
                                    ) : (
                                      // Split batches horizontally logic handled by flex row if many, or col if full scale
                                      <div className={`flex gap-1 w-full h-full ${cellAllocs.length > 1 ? 'flex-row' : 'flex-col'}`}>
                                        {cellAllocs.map((a: any) => (
                                          <div
                                            key={a.id}
                                            className="bg-[#ECE7D1] border border-themePrimary rounded-lg p-2 flex-1 shadow flex flex-col justify-center min-w-[80px] relative group/alloc cursor-pointer"
                                            onClick={(e) => { e.stopPropagation(); setSelectedCell({ day, time, semId: s.id, allocationId: a.id }); setIsModalOpen(true); }}
                                          >
                                            <div className="font-bold text-themeTextMain text-xs truncate" title={(subjects.find((sub: any) => sub.id === a.subject_id) as any)?.name}>
                                              {(subjects.find((sub: any) => sub.id === a.subject_id) as any)?.name || `Sub ${a.subject_id}`}
                                            </div>
                                            <div className="text-themeSecondary text-xs mt-1 truncate">
                                              {(faculties.find((f: any) => f.id === a.faculty_id) as any)?.name}
                                            </div>
                                            <div className="flex justify-between mt-1 items-center gap-1">
                                              <span className="text-themeTextMuted text-[10px] bg-[#F4F0DF] px-1 rounded truncate max-w-[50%]">
                                                {(rooms.find((r: any) => r.id === a.room_id) as any)?.name}
                                              </span>
                                              {a.batches && a.batches.length > 0 && <span className="text-blue-300 text-[10px] font-bold truncate max-w-[50%]">{a.batches.join(', ')}</span>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            });
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

        </div>
      </div>

      {/* Allocation Modal */}
      {isModalOpen && selectedCell && (
        <AllocationModal
          cell={selectedCell}
          onClose={() => { setIsModalOpen(false); setSelectedCell(null); }}
          onSuccess={() => { setIsModalOpen(false); setSelectedCell(null); fetchAllocations(); }}
          allocations={allocations}
        />
      )}

      {/* Export Preview Popup */}
      {showExportPopup && <ExportPopup onClose={() => setShowExportPopup(false)} />}
    </div>
  );
}

// Subcomponent for Allocation
function AllocationModal({ cell, onClose, onSuccess, allocations }: { cell: any, onClose: any, onSuccess: any, allocations: any[] }) {
  const { currentConfig } = useStore();
  const isEditing = !!cell.allocationId;
  const existingAlloc = isEditing ? allocations.find((a: any) => a.id === cell.allocationId) : null;

  const [allocationData, setAllocationData] = useState({
    subject_id: existingAlloc?.subject_id || '',
    faculty_id: existingAlloc?.faculty_id || '',
    room_id: existingAlloc?.room_id || '',
    duration_minutes: existingAlloc?.duration_minutes || currentConfig?.slot_duration_minutes || 60,
    batches_input: existingAlloc?.batches ? existingAlloc.batches.join(', ') : ''
  });

  const [subjects, setSubjects] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch contextual mapped data for this semester
  useEffect(() => {
    const loadContextualData = async () => {
      const [sub, fac, rm] = await Promise.all([
        axios.get(`${API_URL}/subjects?config_id=${currentConfig?.id}`), // Ideally filtered by semester_id
        axios.get(`${API_URL}/mappings/faculty/${cell.semId}`),
        axios.get(`${API_URL}/rooms?config_id=${currentConfig?.id}`) // Optionally mapped rooms
      ]);
      setSubjects(sub.data.filter((s: any) => s.semester_id === cell.semId));
      setFaculties(fac.data);
      setRooms(rm.data);
    };
    loadContextualData();
  }, [cell]);

  const handleChange = (field: string, value: any) => {
    setAllocationData(prev => ({ ...prev, [field]: value }));
  };

  const handleDelete = async () => {
    if (!isEditing) return;
    if (!confirm('Are you sure you want to delete this allocation?')) return;
    setLoading(true);
    try {
      await axios.delete(`${API_URL}/allocations/${cell.allocationId}`);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to delete allocation');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (!allocationData.subject_id || !allocationData.faculty_id || !allocationData.room_id || !allocationData.duration_minutes) {
      setErrorMsg('Please fill all required fields.');
      setLoading(false);
      return;
    }

    // Faculty Workload Validation
    const facId = parseInt(allocationData.faculty_id as string);
    const selectedFac = faculties.find((f: any) => f.id === facId) as any;
    if (selectedFac) {
      const usedGlobal = [...new Map(
        allocations
          .filter((a: any) => a.faculty_id === selectedFac.id && (!isEditing || a.id !== cell.allocationId))
          .map((a: any) => [`${a.day_of_week}-${a.start_time}`, a.duration_minutes])
      ).values()].reduce((sum: number, val: any) => sum + val, 0);

      const remGlobal = (selectedFac.weekly_workload_minutes || 2400) - usedGlobal;
      const inlineUsed = parseInt(allocationData.duration_minutes as any);

      if (remGlobal < inlineUsed) {
        const hh = Math.floor(remGlobal / 60).toString().padStart(2, '0');
        const mm = (remGlobal % 60).toString().padStart(2, '0');
        setErrorMsg(`Workload exceeded for ${selectedFac.name}. Only ${hh}:${mm} total remaining.`);
        setLoading(false);
        return;
      }
    }

    try {
      const payload = {
        config_id: currentConfig?.id,
        semester_id: cell.semId,
        subject_id: parseInt(allocationData.subject_id as string),
        faculty_id: parseInt(allocationData.faculty_id as string),
        room_id: parseInt(allocationData.room_id as string),
        day_of_week: cell.day,
        start_time: cell.time,
        duration_minutes: parseInt(allocationData.duration_minutes as string),
        batches: allocationData.batches_input ? allocationData.batches_input.split(',').map((b: string) => b.trim()).filter((b: string) => b) : []
      };

      if (isEditing) {
        await axios.put(`${API_URL}/allocations/${cell.allocationId}`, payload);
      } else {
        await axios.post(`${API_URL}/allocations`, payload);
      }
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to allocate. Check for conflicts.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#F4F0DF] p-6 md:p-8 rounded-3xl w-full max-w-xl border border-themePrimary shadow-[0_0_50px_rgba(0,0,0,0.5)] transform transition-all scale-100 max-h-[90vh] flex flex-col">

        {/* Header Section */}
        <div className="flex justify-between items-start mb-4 border-b border-[#B8AC86] pb-4 shrink-0">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-black">{isEditing ? 'Edit Allocation' : 'Allocate Slot'}</h2>
            <p className="text-themeTextMuted text-sm font-medium">{cell.day} @ {cell.time.slice(0, 5)} (Semester ID: {cell.semId})</p>
          </div>
        </div>

        {errorMsg && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-3 rounded-lg mb-4 text-sm font-semibold shrink-0 shadow-sm">{errorMsg}</div>}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-hidden h-full">
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">

            <div className="bg-[#F4F0DF] p-5 rounded-2xl border border-[#B8AC86] relative group transition hover:border-themePrimary">
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-themeTextMuted text-[11px] font-bold uppercase tracking-wider mb-1.5">Subject</label>
                  <select required className="w-full bg-white border border-[#C9BE9A] rounded-lg p-2.5 text-[#2F2A1F] text-sm transition shadow-sm"
                    value={allocationData.subject_id} onChange={(e) => handleChange('subject_id', e.target.value)}>
                    <option value="">Select subject...</option>
                    {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.weekly_hours}h/w)</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-themeTextMuted text-[11px] font-bold uppercase tracking-wider mb-1.5">Faculty</label>
                    <select required className="w-full bg-white border border-[#C9BE9A] rounded-lg p-2.5 text-[#2F2A1F] text-sm transition shadow-sm"
                      value={allocationData.faculty_id} onChange={(e) => handleChange('faculty_id', e.target.value)}>
                      <option value="">Select faculty...</option>
                      {faculties.map((f: any) => {
                        const used = [...new Map(
                          allocations
                            .filter((a: any) => a.faculty_id === f.id && (!isEditing || a.id !== cell.allocationId))
                            .map((a: any) => [`${a.day_of_week}-${a.start_time}`, a.duration_minutes])
                        ).values()].reduce((sum: number, val: any) => sum + val, 0);
                        const rem = (f.weekly_workload_minutes || 2400) - used;
                        if (rem <= 0 && allocationData.faculty_id != f.id) return null;
                        const hh = Math.floor(rem / 60).toString().padStart(2, '0');
                        const mm = (rem % 60).toString().padStart(2, '0');
                        return <option key={f.id} value={f.id}>{f.name} (Rem: {hh}:{mm})</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-themeTextMuted text-[11px] font-bold uppercase tracking-wider mb-1.5">Room</label>
                    <select required className="w-full bg-white border border-[#C9BE9A] rounded-lg p-2.5 text-[#2F2A1F] text-sm transition shadow-sm"
                      value={allocationData.room_id} onChange={(e) => handleChange('room_id', e.target.value)}>
                      <option value="">Select room...</option>
                      {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name} (Cap: {r.capacity})</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-themeTextMuted text-[11px] font-bold uppercase tracking-wider mb-1.5">Duration (mins)</label>
                    <input type="number" required className="w-full bg-white border border-[#C9BE9A] rounded-lg p-2.5 text-[#2F2A1F] text-sm transition shadow-sm"
                      value={allocationData.duration_minutes} onChange={(e) => handleChange('duration_minutes', parseInt(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-themeTextMuted text-[11px] font-bold uppercase tracking-wider mb-1.5">Batches (Comma separated)</label>
                    <input type="text" placeholder="e.g. A, B, C" className="w-full bg-white border border-[#C9BE9A] rounded-lg p-2.5 text-[#2F2A1F] text-sm transition shadow-sm"
                      value={allocationData.batches_input} onChange={(e) => handleChange('batches_input', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-[#B8AC86] shrink-0 mt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-[#DBCEA5] hover:bg-[#C9BE9A] rounded-xl font-bold transition text-[#5E5642] shadow-sm">Cancel</button>
            {isEditing && (
              <button type="button" onClick={handleDelete} disabled={loading} className="flex-1 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 rounded-xl font-bold transition text-red-400 shadow-sm disabled:opacity-50">Delete Allocation</button>
            )}
            <button type="submit" disabled={loading} className="flex-1 btn-primary disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
