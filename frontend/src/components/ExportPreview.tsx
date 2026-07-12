import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { parse, addMinutes, isBefore, format } from 'date-fns';
import { API_URL } from '../config';
import { fetchConfigData, fetchAllocations } from '../apiCache';
import { useLoading } from '../contexts/LoadingContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* Pastel subject block colors for the dark theme */
const SUBJECT_COLORS = [
  { bg: 'rgba(196,181,253,0.12)', border: 'rgba(196,181,253,0.3)', text: '#C4B5FD' },   // lavender
  { bg: 'rgba(163,230,53,0.10)', border: 'rgba(163,230,53,0.25)', text: '#A3E635' },     // mint
  { bg: 'rgba(103,232,249,0.10)', border: 'rgba(103,232,249,0.25)', text: '#67E8F9' },   // cyan
  { bg: 'rgba(253,230,138,0.10)', border: 'rgba(253,230,138,0.25)', text: '#FDE68A' },   // yellow
  { bg: 'rgba(249,168,212,0.10)', border: 'rgba(249,168,212,0.25)', text: '#F9A8D4' },   // pink
  { bg: 'rgba(110,231,183,0.10)', border: 'rgba(110,231,183,0.25)', text: '#6EE7B7' },   // emerald
];

export default function ExportPreview() {
  const { currentConfig } = useStore();
  const navigate = useNavigate();
  const { withLoading } = useLoading();

  const [branches, setBranches] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'branch' | 'faculty' | 'room'>('branch');
  const [selectedType, setSelectedType] = useState<string>('master');

  useEffect(() => {
    if (!currentConfig?.id) return;
    const load = async () => {
      await withLoading(async () => {
        const [data, allocs] = await Promise.all([
          fetchConfigData(currentConfig.id!),
          fetchAllocations(currentConfig.id!),
        ]);
        setBranches(data.branches);
        setSemesters(data.semesters);
        setFaculties(data.faculties);
        setRooms(data.rooms);
        setSubjects(data.subjects);
        setAllocations(allocs);
      }, 'Loading export data...');
    };
    load();
  }, [currentConfig]);

  // Generate timeslots with break awareness
  const timeslots = useMemo(() => {
    if (!currentConfig) return [];
    const slots: any[] = [];
    const breaks = currentConfig.breaks || [];
    const start = parse(currentConfig.start_time, 'HH:mm:ss', new Date());
    const end = parse(currentConfig.end_time, 'HH:mm:ss', new Date());
    let current = start;

    while (isBefore(current, end)) {
      const currentStr = format(current, 'HH:mm:ss');
      const overlappingBreak = breaks.find((b: any) => b.start_time === currentStr);
      if (overlappingBreak) {
        const breakEnd = addMinutes(current, overlappingBreak.duration_minutes);
        slots.push({ type: 'break', start: currentStr, end: format(breakEnd, 'HH:mm:ss'), display: 'Break' });
        current = breakEnd;
      } else {
        const slotEnd = addMinutes(current, currentConfig.slot_duration_minutes);
        slots.push({ type: 'slot', start: currentStr, end: format(slotEnd, 'HH:mm:ss'), display: `${format(current, 'HH:mm')} - ${format(slotEnd, 'HH:mm')}` });
        current = slotEnd;
      }
    }
    return slots;
  }, [currentConfig]);

  // Filter allocations based on selection
  const filteredAllocations = useMemo(() => {
    if (selectedType === 'master') return allocations;
    const [type, id] = selectedType.split(':');
    const numId = parseInt(id);
    if (type === 'semester') return allocations.filter((a: any) => a.semester_id === numId);
    if (type === 'faculty') return allocations.filter((a: any) => a.faculty_id === numId);
    if (type === 'room') return allocations.filter((a: any) => a.room_id === numId);
    return allocations;
  }, [allocations, selectedType]);

  // Get column structure for the preview
  const previewColumns = useMemo(() => {
    if (selectedType === 'master' || selectedType.startsWith('semester:')) {
      let relevantSems = semesters;
      if (selectedType.startsWith('semester:')) {
        const semId = parseInt(selectedType.split(':')[1]);
        relevantSems = semesters.filter((s: any) => s.id === semId);
      }
      return relevantSems.map((s: any) => {
        const branch = branches.find((b: any) => b.id === s.branch_id);
        return { id: s.id, label: `${branch?.name || ''} ${s.name}`, type: 'semester' as const };
      });
    }
    if (selectedType.startsWith('faculty:') || selectedType.startsWith('room:')) {
      const semIds = [...new Set(filteredAllocations.map((a: any) => a.semester_id))];
      return semIds.map(sid => {
        const s = semesters.find((sem: any) => sem.id === sid);
        const branch = s ? branches.find((b: any) => b.id === s.branch_id) : null;
        return { id: sid, label: `${branch?.name || ''} ${s?.name || ''}`, type: 'semester' as const };
      });
    }
    return [];
  }, [selectedType, semesters, branches, filteredAllocations]);

  // Helper: get allocations for a cell (Master view)
  const getCellAllocsMaster = (day: string, time: string, semId: number) => {
    return filteredAllocations.filter((a: any) => a.day_of_week === day && a.start_time === time && a.semester_id === semId);
  };

  // Helper: get allocations for a cell (Grid view)
  const getCellAllocsGrid = (day: string, time: string) => {
    return filteredAllocations.filter((a: any) => a.day_of_week === day && a.start_time === time);
  };

  // Selection label
  const selectionLabel = useMemo(() => {
    if (selectedType === 'master') return 'Master Timetable';
    const [type, id] = selectedType.split(':');
    const numId = parseInt(id);
    if (type === 'semester') {
      const s = semesters.find((sem: any) => sem.id === numId);
      const b = s ? branches.find((br: any) => br.id === s.branch_id) : null;
      return `${b?.name || ''} ${s?.name || ''}`;
    }
    if (type === 'faculty') {
      const f = faculties.find((fac: any) => fac.id === numId);
      return `Faculty: ${f?.name || ''}`;
    }
    if (type === 'room') {
      const r = rooms.find((rm: any) => rm.id === numId);
      return `Room: ${r?.name || ''}`;
    }
    return '';
  }, [selectedType, semesters, branches, faculties, rooms]);

  // --- EXPORT via backend ---
  const downloadExcel = async (exportMode: string, exportValue?: string) => {
    try {
      await withLoading(async () => {
        const params = new URLSearchParams({ config_id: String(currentConfig?.id), mode: exportMode });
        if (exportValue) params.set('value', exportValue);

        const response = await axios.get(`${API_URL}/export_excel?${params.toString()}`, { responseType: 'blob' });

        // Extract filename from Content-Disposition header
        let filename = 'Timetable.xlsx';
        const disposition = response.headers['content-disposition'];

        if (disposition && disposition.indexOf('attachment') !== -1) {
          const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
          const matches = filenameRegex.exec(disposition);
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
          }
        }

        // Create blob download
        const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 'Generating Excel file...');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Export failed');
    }
  };

  const handleExport = () => {
    if (selectedType === 'master') {
      downloadExcel('master');
    } else {
      downloadExcel('selected', selectedType);
    }
  };

  const handleExportAll = () => {
    downloadExcel('all');
  };

  const tabStyle = (tab: string) =>
    `flex-1 py-2.5 text-xs font-bold uppercase tracking-wider text-center cursor-pointer transition-all border-b-2 ${activeTab === tab
      ? 'border-transparent text-white bg-[#C4B5FD]'
      : 'border-transparent text-[#9CA3AF] bg-[#2E3345] hover:bg-[#2E3345]'
    }`;

  return (
    <div className="flex h-screen bg-[#0D0F14] text-[#E5E7EB] overflow-hidden">
      {/* ══════ LEFT PANEL ══════ */}
      <div className="w-[280px] min-w-[280px] border-r border-[#2E3345] flex flex-col bg-[#1C1F2A]">
        {/* Header */}
        <div className="p-4 border-b border-[#2E3345] flex justify-between items-center bg-[#2E3345]">
          <h2 className="text-lg font-bold text-[#E5E7EB]">Export Preview</h2>
          <button onClick={() => navigate('/grid')} className="w-8 h-8 rounded-lg bg-themePrimary hover:bg-[#C4B5FD]/80 text-white flex items-center justify-center text-sm font-bold transition" title="Back to Grid">←</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2E3345]">
          <button className={tabStyle('branch')} onClick={() => { setActiveTab('branch'); setSelectedType('master'); }}>Branch</button>
          <button className={tabStyle('faculty')} onClick={() => { setActiveTab('faculty'); setSelectedType('master'); }}>Faculty</button>
          <button className={tabStyle('room')} onClick={() => { setActiveTab('room'); setSelectedType('master'); }}>Room</button>
        </div>

        {/* Selection list */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {activeTab === 'branch' && (
            <div className="space-y-1">
              <button
                onClick={() => setSelectedType('master')}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition ${selectedType === 'master' ? 'bg-themePrimary/20 text-themePrimary border border-blue-500/30' : 'text-themeTextMain hover:bg-themePrimary/50'}`}
              >
                📋 Master Timetable
              </button>
              {branches.map((b: any) => {
                const branchSems = semesters.filter((s: any) => s.branch_id === b.id);
                return (
                  <div key={b.id} className="mt-2">
                    <div className="px-3 py-1.5 text-xs font-bold text-themeSecondary uppercase tracking-wider">{b.name}</div>
                    {branchSems.map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedType(`semester:${s.id}`)}
                        className={`w-full text-left px-3 py-2 pl-6 rounded-lg text-sm transition ${selectedType === `semester:${s.id}` ? 'bg-themePrimary/20 text-themePrimary border border-blue-500/30 font-bold' : 'text-themeTextMuted hover:bg-themePrimary/50 hover:text-themeTextMain'}`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'faculty' && (
            <div className="space-y-1">
              {[...faculties].sort((a, b) => a.name.localeCompare(b.name)).map((f: any) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedType(`faculty:${f.id}`)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition flex items-center gap-2 ${selectedType === `faculty:${f.id}` ? 'bg-themePrimary/20 text-themePrimary border border-blue-500/30 font-bold' : 'text-themeTextMain hover:bg-themePrimary/50'}`}
                >
                  <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center font-bold">{f.name?.[0]}</span>
                  {f.name}
                </button>
              ))}
              {faculties.length === 0 && <p className="text-themeTextMuted text-xs text-center py-4">No faculty found</p>}
            </div>
          )}

          {activeTab === 'room' && (
            <div className="space-y-1">
              {[...rooms].sort((a, b) => a.name.localeCompare(b.name)).map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedType(`room:${r.id}`)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition flex items-center gap-2 ${selectedType === `room:${r.id}` ? 'bg-themePrimary/20 text-themePrimary border border-blue-500/30 font-bold' : 'text-themeTextMain hover:bg-themePrimary/50'}`}
                >
                  <span className="w-6 h-6 rounded bg-emerald-500/20 text-themeSecondary text-xs flex items-center justify-center font-bold">🚪</span>
                  {r.name} <span className="text-themeTextMuted text-xs ml-auto">Cap: {r.capacity}</span>
                </button>
              ))}
              {rooms.length === 0 && <p className="text-themeTextMuted text-xs text-center py-4">No rooms found</p>}
            </div>
          )}
        </div>

        {/* Export Buttons */}
        <div className="p-3 border-t border-[#2E3345] space-y-2">
          <button onClick={handleExport} className="w-full btn-primary text-sm flex items-center justify-center gap-2">
            ⬇ Export Selected
          </button>
          <button onClick={handleExportAll} className="w-full btn-primary text-sm flex items-center justify-center gap-2">
            📦 Export All
          </button>
        </div>
      </div>

      {/* ══════ RIGHT PANEL — PREVIEW ══════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[#0D0F14]">
        {/* Preview Header */}
        <div className="p-4 border-b border-[#2E3345] bg-[#0D0F14] flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-[#E5E7EB] font-bold text-lg">{selectionLabel}</h3>
            <p className="text-[#9CA3AF] text-xs mt-0.5">{filteredAllocations.length} allocations • {previewColumns.length} columns</p>
          </div>
          <div className="px-3 py-1.5 bg-[#C4B5FD]/10 border border-themePrimary/50 rounded-full text-themePrimary text-xs font-bold">
            Preview Mode
          </div>
        </div>

        {/* Excel-like preview grid */}
        <div className="flex-1 min-h-0 overflow-auto p-4 custom-scrollbar">
          {/* Title Header mimicking Excel */}
          <div className="mb-4 text-center">
            <div className="text-themeTextMuted text-xs font-bold uppercase tracking-widest mb-1">University Timetable</div>
            <div className="text-[#E5E7EB] text-lg font-bold">{currentConfig?.name || 'Master Timetable'}</div>
            <div className="text-themeTextMuted text-xs mt-1">{selectionLabel} • {currentConfig?.start_time?.slice(0, 5)} – {currentConfig?.end_time?.slice(0, 5)}</div>
          </div>

          <div className="bg-[#1C1F2A] border border-[#2E3345] rounded-xl overflow-hidden shadow-2xl" style={{ display: 'inline-block', minWidth: '100%' }}>
            {selectedType === 'master' ? (
              // MASTER VIEW LAYOUT (Day/Time as rows, Semesters as columns)
              <table className="border-collapse text-xs" style={{ width: 'max-content', minWidth: '100%' }}>
                <thead className="bg-[#262A36] border-b border-[#2E3345]">
                  <tr>
                    <th className="border-r border-[#2E3345] p-2 text-[#E5E7EB] font-bold w-[60px] sticky left-0 bg-[#262A36] z-10 whitespace-nowrap">Day</th>
                    <th className="border-r border-[#2E3345] p-2 text-[#E5E7EB] font-bold w-[100px] sticky left-[60px] bg-[#262A36] z-10 whitespace-nowrap shadow-[1px_0_0_0_#2E3345]">Time</th>
                    {previewColumns.length > 0 ? previewColumns.map((col) => (
                      <th key={col.id} className="border-r border-[#2E3345] p-2 text-[#C4B5FD] font-bold min-w-[150px] text-center whitespace-nowrap uppercase tracking-wider text-xs">
                        {col.label}
                      </th>
                    )) : (
                      <th className="border-r border-[#2E3345] p-2 text-[#9CA3AF] italic whitespace-nowrap">No columns to display</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <React.Fragment key={day}>
                      {timeslots.map((slot: any, slotIdx: number) => (
                        <tr key={`${day}-${slot.start}`} className="group transition">
                          {slotIdx === 0 && (
                            <td
                              rowSpan={timeslots.length}
                              className="border border-[#2E3345] p-2 text-[#C4B5FD] font-bold text-center bg-[#262A36] sticky left-0 z-10 whitespace-nowrap uppercase tracking-widest text-sm"
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                            >
                              {day}
                            </td>
                          )}
                          <td className="border border-[#2E3345] p-2 text-[#9CA3AF] font-semibold text-center whitespace-nowrap sticky left-[60px] bg-[#262A36] z-10 shadow-[1px_0_0_0_#2E3345]">
                            {slot.display}
                          </td>
                          {slot.type === 'break' ? (
                            <td
                              colSpan={Math.max(previewColumns.length, 1)}
                              className="border border-[#2E3345] bg-[#1A1D26] text-center text-[#9CA3AF] font-bold tracking-[0.5em] uppercase h-[40px] whitespace-nowrap relative overflow-hidden"
                            >
                               <div className="absolute inset-0 flex items-center justify-center">
                                 --------- BREAK ---------
                               </div>
                            </td>
                          ) : (
                            previewColumns.length > 0 ? previewColumns.map((col) => {
                              const cellAllocs = getCellAllocsMaster(day, slot.start, col.id);
                              return (
                                <td key={col.id} className="border border-[#2E3345] p-1.5 align-top min-h-[40px] bg-[#0D0F14] hover:bg-[#1C1F2A] transition-colors">
                                  {cellAllocs.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      {cellAllocs.map((a: any, aIdx: number) => {
                                        const color = SUBJECT_COLORS[aIdx % SUBJECT_COLORS.length];
                                        return (
                                        <div key={a.id} className="rounded-lg p-1.5 text-[10px] leading-tight" style={{ background: color.bg, border: `1px solid ${color.border}` }}>
                                          <div className="font-bold truncate" style={{ color: color.text }}>{subjects.find((sub: any) => sub.id === a.subject_id)?.name}</div>
                                          <div className="text-[#67E8F9] truncate">{faculties.find((f: any) => f.id === a.faculty_id)?.name}</div>
                                          <div className="flex justify-between mt-1 items-center gap-1">
                                            <span className="text-[#9CA3AF] text-[10px] bg-[#262A36] px-1 rounded truncate">{rooms.find((r: any) => r.id === a.room_id)?.name}</span>
                                            {a.batches?.length > 0 && <span className="text-[#FDE68A] text-[10px] font-bold truncate">{a.batches.join(',')}</span>}
                                          </div>
                                        </div>
                                      )})}
                                    </div>
                                  ) : (
                                    <div className="h-[30px]" />
                                  )}
                                </td>
                              );
                            }) : (
                              <td className="border border-[#2E3345] p-2 text-[#9CA3AF] italic text-center whitespace-nowrap bg-[#0D0F14]">Select an item to preview</td>
                            )
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              // GRID VIEW LAYOUT (Time as rows, Days as columns) for Faculty and Room
              <table className="border-collapse text-xs" style={{ width: 'max-content', minWidth: '100%' }}>
                <thead className="bg-[#262A36] border-b border-[#2E3345] sticky top-0 z-20">
                  <tr>
                    <th className="border-r border-[#2E3345] p-3 min-w-[120px] bg-[#262A36] z-30 sticky left-0 shadow-[1px_0_0_0_#2E3345] text-[#E5E7EB]">Time</th>
                    {DAYS.map((day) => (
                      <th key={day} className="border-r border-[#2E3345] p-3 text-center font-bold text-[#C4B5FD] uppercase tracking-widest text-sm bg-[#262A36] min-w-[200px]">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeslots.map((slot: any) => (
                    <tr key={slot.start} className="group transition">
                      <td className="border border-[#2E3345] p-3 text-xs font-semibold text-[#9CA3AF] sticky left-0 bg-[#262A36] z-10 whitespace-nowrap text-center shadow-[1px_0_0_0_#2E3345]">
                        {slot.display}
                      </td>
                      {slot.type === 'break' ? (
                        <td colSpan={DAYS.length} className="border border-[#2E3345] bg-[#1A1D26] p-2 text-center text-[#9CA3AF] font-bold tracking-[0.5em] uppercase text-sm h-[60px] relative overflow-hidden">
                          <div className="absolute inset-0 flex items-center justify-center">
                            --------- BREAK ---------
                          </div>
                        </td>
                      ) : (
                        DAYS.map((day) => {
                          const cellAllocs = getCellAllocsGrid(day, slot.start);
                          return (
                            <td key={day} className="border border-[#2E3345] p-2 relative min-h-[80px] bg-[#0D0F14] hover:bg-[#1C1F2A] transition-colors duration-200 align-top">
                              {cellAllocs.length > 0 ? (
                                <div className={`flex gap-1 w-full h-full flex-col`}>
                                  {cellAllocs.map((a: any, aIdx: number) => {
                                    const color = SUBJECT_COLORS[aIdx % SUBJECT_COLORS.length];
                                    const sem = semesters.find(s => s.id === a.semester_id);
                                    const branch = sem ? branches.find(b => b.id === sem.branch_id) : null;
                                    const branchSemStr = `${branch?.name || ''} ${sem?.name || ''}`;
                                    
                                    let detailLine = '';
                                    if (selectedType.startsWith('room:')) {
                                        detailLine = faculties.find((f: any) => f.id === a.faculty_id)?.name || '';
                                    } else if (selectedType.startsWith('faculty:')) {
                                        detailLine = rooms.find((r: any) => r.id === a.room_id)?.name || '';
                                    } else {
                                        detailLine = `${faculties.find((f: any) => f.id === a.faculty_id)?.name || ''} • ${rooms.find((r: any) => r.id === a.room_id)?.name || ''}`;
                                    }
                                    
                                    return (
                                      <div key={a.id} className="rounded-lg p-2 flex flex-col justify-center shadow" style={{ background: color.bg, border: `1px solid ${color.border}` }}>
                                        <div className="font-bold text-xs truncate" style={{ color: color.text }}>{subjects.find((sub: any) => sub.id === a.subject_id)?.name}</div>
                                        {!selectedType.startsWith('semester:') && <div className="text-[#E5E7EB] text-[10px] mt-0.5 truncate">{branchSemStr}</div>}
                                        {detailLine && <div className="text-[#67E8F9] text-[10px] mt-0.5 truncate">{detailLine}</div>}
                                        {a.batches?.length > 0 && <div className="text-[#FDE68A] text-[10px] font-bold truncate mt-0.5">{a.batches.join(',')}</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="w-full h-full min-h-[60px]"></div>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
