import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { parse, addMinutes, isBefore, format } from 'date-fns';

const API_URL = 'http://localhost:8000/api';
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
  const [selectedCell, setSelectedCell] = useState<{day: string, time: string, semId: number} | null>(null);

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

  // Generate Y-Axis Tiemslots
  const generateTimeslots = () => {
    if (!currentConfig) return [];
    const slots = [];
    const start = parse(currentConfig.start_time, 'HH:mm:ss', new Date());
    const end = parse(currentConfig.end_time, 'HH:mm:ss', new Date());
    let current = start;

    while (isBefore(current, end)) {
      slots.push(format(current, 'HH:mm:ss'));
      current = addMinutes(current, currentConfig.slot_duration_minutes);
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
    <div className="flex flex-col h-screen bg-slate-900 text-slate-300 overflow-hidden">
      {/* Header Bar */}
      <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center shadow-lg z-10">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">
            {currentConfig?.name}
          </h1>
          <p className="text-sm text-slate-400">
            {currentConfig?.start_time} - {currentConfig?.end_time} • {currentConfig?.slot_duration_minutes}m slots
          </p>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition">↩ Undo</button>
          <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition">↪ Redo</button>
          <button onClick={() => navigate('/configure')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition shadow border border-slate-600">⚙ Settings</button>
          <button className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white shadow-lg shadow-blue-500/30 transition">Export &rarr;</button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto relative p-4 custom-scrollbar">
        <div className="inline-block min-w-full rounded-2xl border border-slate-700 bg-slate-800/50 backdrop-blur-sm overflow-hidden shadow-2xl">
          
          <table className="w-full border-collapse">
            {/* Table Header: Branches and Semesters */}
            <thead className="bg-slate-800 border-b border-slate-700 sticky top-0 z-20">
              <tr>
                <th className="border-r border-slate-700 p-3 min-w-[120px] bg-slate-900 z-30 sticky left-0 shadow-sm" rowSpan={2}>Day / Time</th>
                {branches.map((b: any) => {
                  const sems = semesters.filter((s: any) => s.branch_id === b.id);
                  if (sems.length === 0) return null;
                  return (
                    <th key={b.id} colSpan={sems.length} className="border-r border-slate-700 p-3 text-center font-bold text-emerald-400 uppercase tracking-widest text-sm bg-slate-800">
                      {b.name}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {branches.map((b: any) => {
                  const sems = semesters.filter((s: any) => s.branch_id === b.id);
                  return sems.map((s: any) => (
                    <th key={s.id} className="border-r border-slate-700 p-2 text-center text-sm font-semibold text-slate-300 bg-slate-800/80 min-w-[200px]">
                      {s.name}
                    </th>
                  ));
                })}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {DAYS.map((day) => {
                // Track cells that should not be rendered because they are covered by a previous row's rowSpan
                const coveredCells = new Set<string>();

                return (
                  <React.Fragment key={day}>
                    {/* Day Row Header */}
                    <tr>
                      <td colSpan={100} className="bg-slate-900/80 p-2 font-bold text-blue-400 sticky left-0 z-10 border-y border-slate-700/50 shadow-inner block w-full text-center">
                        {day}
                      </td>
                    </tr>
                    {/* Timeslot Rows */}
                    {timeslots.map((time, timeIndex) => (
                      <tr key={`${day}-${time}`} className="group hover:bg-slate-800/30 transition">
                        <td className="border border-slate-700/50 p-3 text-sm font-medium text-slate-400 sticky left-0 bg-slate-900 z-10 whitespace-nowrap text-center group-hover:bg-slate-800 shadow-[1px_0_0_0_#334155]">
                          {time.slice(0, 5)}
                        </td>
                        
                        {/* Cells for each Sem */}
                        {branches.map((b: any) => {
                          const sems = semesters.filter((s: any) => s.branch_id === b.id);
                          return sems.map((s: any) => {
                            const cellKey = `${s.id}-${timeIndex}`;
                            if (coveredCells.has(cellKey)) {
                              return null; // Skip rendering this cell
                            }

                            const cellAllocs = getAllocationsForCell(day, time, s.id);
                            
                            // Calculate max rowSpan based on all allocations in this cell
                            let maxSpan = 1;
                            if (cellAllocs.length > 0 && currentConfig?.slot_duration_minutes) {
                              const maxDuration = Math.max(...cellAllocs.map((a: any) => a.duration_minutes));
                              maxSpan = Math.max(1, Math.ceil(maxDuration / currentConfig.slot_duration_minutes));
                            }

                            // Mark future cells as covered
                            if (maxSpan > 1) {
                              for (let i = 1; i < maxSpan; i++) {
                                coveredCells.add(`${s.id}-${timeIndex + i}`);
                              }
                            }
                            
                            return (
                              <td 
                                key={`${day}-${time}-${s.id}`} 
                                rowSpan={maxSpan}
                                className="border border-slate-700/50 p-2 relative min-h-[80px] cursor-pointer hover:bg-slate-700/40 transition align-top"
                                onClick={() => handleCellClick(day, time, s.id)}
                            >
                              <div className="flex flex-col gap-1 w-full h-full">
                                {cellAllocs.length === 0 ? (
                                  <div className="w-full h-full min-h-[60px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-slate-500 font-bold text-xl">+</span>
                                  </div>
                                ) : (
                                  // Split batches horizontally logic handled by flex row if many, or col if full scale
                                  <div className={`flex gap-1 w-full h-full ${cellAllocs.length > 1 ? 'flex-row' : 'flex-col'}`}>
                                    {cellAllocs.map((a: any) => (
                                      <div key={a.id} className="bg-blue-900/40 border border-blue-500/50 rounded-lg p-2 flex-1 shadow flex flex-col justify-center min-w-[80px] relative group/alloc">
                                          <button onClick={(e) => { e.stopPropagation(); handleDeleteAllocation(a.id); }} className="absolute top-1 right-1 text-slate-400 hover:text-red-400 opacity-0 group-hover/alloc:opacity-100 bg-slate-900 rounded-full w-4 h-4 flex items-center justify-center text-[10px]" title="Delete Allocation">✕</button>
                                          <div className="font-bold text-blue-100 text-xs truncate" title={(subjects.find((sub:any)=>sub.id===a.subject_id) as any)?.name}>
                                            {(subjects.find((sub:any)=>sub.id===a.subject_id) as any)?.name || `Sub ${a.subject_id}`}
                                          </div>
                                          <div className="text-emerald-400 text-xs mt-1 truncate">
                                            {(faculties.find((f:any)=>f.id===a.faculty_id) as any)?.name}
                                          </div>
                                          <div className="flex justify-between mt-1 items-center">
                                            <span className="text-slate-400 text-[10px] bg-slate-800 px-1 rounded">
                                              {(rooms.find((r:any)=>r.id===a.room_id) as any)?.name}
                                            </span>
                                            {a.batches && a.batches.length > 0 && <span className="text-blue-300 text-[10px] font-bold">{a.batches.join(', ')}</span>}
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
                  ))}
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
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => { setIsModalOpen(false); fetchAllocations(); }}
          allocations={allocations}
        />
      )}
    </div>
  );
}

// Subcomponent for Allocation
function AllocationModal({ cell, onClose, onSuccess, allocations }: { cell: any, onClose: any, onSuccess: any, allocations: any[] }) {
  const { currentConfig } = useStore();
  const [allocationsData, setAllocationsData] = useState([{
    id: Date.now(),
    subject_id: '',
    faculty_id: '',
    room_id: '',
    duration_minutes: currentConfig?.slot_duration_minutes || 60,
    batches_input: ''
  }]);

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
      setSubjects(sub.data.filter((s:any) => s.semester_id === cell.semId));
      setFaculties(fac.data);
      setRooms(rm.data);
    };
    loadContextualData();
  }, [cell]);

  const handleAddBlock = () => {
    setAllocationsData(prev => [...prev, {
      id: Date.now() + Math.random(),
      subject_id: '',
      faculty_id: '',
      room_id: '',
      duration_minutes: currentConfig?.slot_duration_minutes || 60,
      batches_input: ''
    }]);
  };

  const handleRemoveBlock = (id: number) => {
    setAllocationsData(prev => prev.filter(a => a.id !== id));
  };

  const handleChange = (id: number, field: string, value: any) => {
    setAllocationsData(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    // Pre-calculate inline faculty workload usage to prevent double-booking bypass
    const inlineFacultyUsage: Record<number, number> = {};
    for (const alloc of allocationsData) {
      if (!alloc.subject_id || !alloc.faculty_id || !alloc.room_id || !alloc.duration_minutes) {
         setErrorMsg('Please fill all required fields in all allocation blocks.');
         setLoading(false);
         return;
      }
      const facId = parseInt(alloc.faculty_id);
      inlineFacultyUsage[facId] = (inlineFacultyUsage[facId] || 0) + alloc.duration_minutes;
    }

    // Faculty Workload Validation
    for (const alloc of allocationsData) {
      const facId = parseInt(alloc.faculty_id);
      const selectedFac = faculties.find((f:any) => f.id === facId) as any;
      if (selectedFac) {
        // Find unique sessions across all allocations
        const usedGlobal = [...new Map(
          allocations
            .filter((a:any) => a.faculty_id === selectedFac.id)
            .map((a:any) => [`${a.day_of_week}-${a.start_time}`, a.duration_minutes])
        ).values()].reduce((sum:number, val:any) => sum + val, 0);

        const remGlobal = (selectedFac.weekly_workload_minutes || 2400) - usedGlobal;
        const inlineUsed = inlineFacultyUsage[facId];

        if (remGlobal < inlineUsed) {
          const hh = Math.floor(remGlobal / 60).toString().padStart(2, '0');
          const mm = (remGlobal % 60).toString().padStart(2, '0');
          setErrorMsg(`Workload exceeded for ${selectedFac.name}. Only ${hh}:${mm} total remaining.`);
          setLoading(false);
          return;
        }
      }
    }

    try {
      await Promise.all(allocationsData.map(alloc => 
        axios.post(`${API_URL}/allocations`, {
          config_id: currentConfig?.id,
          semester_id: cell.semId,
          subject_id: parseInt(alloc.subject_id),
          faculty_id: parseInt(alloc.faculty_id),
          room_id: parseInt(alloc.room_id),
          day_of_week: cell.day,
          start_time: cell.time,
          duration_minutes: alloc.duration_minutes,
          batches: alloc.batches_input ? alloc.batches_input.split(',').map((b:string) => b.trim()).filter((b:string) => b) : []
        })
      ));
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to allocate. Check for conflicts.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 md:p-8 rounded-3xl w-full max-w-xl border border-slate-600 shadow-[0_0_50px_rgba(0,0,0,0.5)] transform transition-all scale-100 max-h-[90vh] flex flex-col">
        
        {/* Header Section */}
        <div className="flex justify-between items-start mb-4 border-b border-slate-700/50 pb-4 shrink-0">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-white">Allocate Slot</h2>
            <p className="text-slate-400 text-sm font-medium">{cell.day} @ {cell.time.slice(0, 5)} (Semester ID: {cell.semId})</p>
          </div>
          <button 
            type="button" 
            onClick={handleAddBlock} 
            className="flex items-center gap-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 px-4 py-2 rounded-full font-bold text-sm transition border border-blue-500/20 shadow-sm"
          >
            <span className="text-lg leading-none mt-[-2px]">+</span> Add Allocation
          </button>
        </div>
        
        {errorMsg && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-3 rounded-lg mb-4 text-sm font-semibold shrink-0 shadow-sm">{errorMsg}</div>}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-hidden h-full">
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
            
            {allocationsData.map((data, index) => (
              <div key={data.id} className="bg-slate-900/40 p-5 rounded-2xl border border-slate-700/50 relative group transition hover:border-slate-600">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-blue-900/40 text-blue-400 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border border-blue-500/20">{index + 1}</span>
                    <h3 className="text-slate-300 text-sm font-bold uppercase tracking-wider">Allocation details</h3>
                  </div>
                  {allocationsData.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => handleRemoveBlock(data.id)} 
                      className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition" 
                      title="Remove Block"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">Subject</label>
                    <select required className="w-full bg-slate-900/80 border border-slate-600 rounded-lg p-2.5 text-slate-200 text-sm focus:border-blue-500 focus:outline-none transition shadow-sm"
                      value={data.subject_id} onChange={(e) => handleChange(data.id, 'subject_id', e.target.value)}>
                      <option value="">Select subject...</option>
                      {subjects.map((s:any) => <option key={s.id} value={s.id}>{s.name} ({s.weekly_hours}h/w)</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">Faculty</label>
                      <select required className="w-full bg-slate-900/80 border border-slate-600 rounded-lg p-2.5 text-slate-200 text-sm focus:border-blue-500 focus:outline-none transition shadow-sm"
                        value={data.faculty_id} onChange={(e) => handleChange(data.id, 'faculty_id', e.target.value)}>
                        <option value="">Select faculty...</option>
                        {faculties.map((f:any) => {
                          const used = [...new Map(
                            allocations
                              .filter((a:any) => a.faculty_id === f.id)
                              .map((a:any) => [`${a.day_of_week}-${a.start_time}`, a.duration_minutes])
                          ).values()].reduce((sum:number, val:any) => sum + val, 0);
                          const rem = (f.weekly_workload_minutes || 2400) - used;
                          if (rem <= 0) return null;
                          const hh = Math.floor(rem / 60).toString().padStart(2, '0');
                          const mm = (rem % 60).toString().padStart(2, '0');
                          return <option key={f.id} value={f.id}>{f.name} (Rem: {hh}:{mm})</option>;
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">Room</label>
                      <select required className="w-full bg-slate-900/80 border border-slate-600 rounded-lg p-2.5 text-slate-200 text-sm focus:border-blue-500 focus:outline-none transition shadow-sm"
                        value={data.room_id} onChange={(e) => handleChange(data.id, 'room_id', e.target.value)}>
                        <option value="">Select room...</option>
                        {rooms.map((r:any) => <option key={r.id} value={r.id}>{r.name} (Cap: {r.capacity})</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">Duration (mins)</label>
                      <input type="number" required className="w-full bg-slate-900/80 border border-slate-600 rounded-lg p-2.5 text-slate-200 text-sm focus:border-blue-500 focus:outline-none transition shadow-sm"
                        value={data.duration_minutes} onChange={(e) => handleChange(data.id, 'duration_minutes', parseInt(e.target.value))}/>
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">Batches (Comma separated)</label>
                      <input type="text" placeholder="e.g. A, B, C" className="w-full bg-slate-900/80 border border-slate-600 rounded-lg p-2.5 text-slate-200 text-sm focus:border-blue-500 focus:outline-none transition shadow-sm"
                        value={data.batches_input} onChange={(e) => handleChange(data.id, 'batches_input', e.target.value)}/>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-4 pt-4 border-t border-slate-700/50 shrink-0 mt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition text-slate-200 shadow-sm">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white shadow-lg shadow-blue-500/30 transition disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Allocations &rarr;'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
