import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import * as XLSX from 'xlsx';
import { parse, addMinutes, isBefore, format } from 'date-fns';
import { fetchConfigData, fetchAllocations } from '../apiCache';
import { useLoading } from '../contexts/LoadingContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ExportPopupProps {
  onClose: () => void;
}

export default function ExportPopup({ onClose }: ExportPopupProps) {
  const { currentConfig } = useStore();
  const { withLoading } = useLoading();

  const [branches, setBranches] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'branch' | 'faculty' | 'room'>('branch');
  const [selectedType, setSelectedType] = useState<string>('master'); // master, semester:<id>, faculty:<id>, room:<id>

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
        return { id: sid as number, label: `${branch?.name || ''} ${s?.name || ''}`, type: 'semester' as const };
      });
    }
    return [];
  }, [selectedType, semesters, branches, filteredAllocations]);

  // Helper: get allocations for a cell
  const getCellAllocs = (day: string, time: string, semId: number) => {
    return filteredAllocations.filter((a: any) => a.day_of_week === day && a.start_time === time && a.semester_id === semId);
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

  // --- EXPORT via Frontend XLSX ---
  const downloadExcel = async (exportMode: string) => {
    try {
      await withLoading(async () => {
        const wsData: any[][] = [];

        // 1. Title Rows
        wsData.push([`University Timetable - ${currentConfig?.name || 'Master Timetable'}`]);
        wsData.push([`${selectionLabel} • ${currentConfig?.start_time?.slice(0, 5)} – ${currentConfig?.end_time?.slice(0, 5)}`]);
        wsData.push([]); // Empty row for spacing

        // 2. Headers
        const headers = ['Day', 'Time'];
        previewColumns.forEach(col => headers.push(col.label));
        wsData.push(headers);

        // 3. Populate Rows
        DAYS.forEach(day => {
          timeslots.forEach((slot, slotIdx) => {
            const row: any[] = [];

            // Day column
            if (slotIdx === 0) {
              row.push(day);
            } else {
              row.push(''); // Leave empty for vertical merge
            }

            // Time column
            row.push(slot.display);

            // Data columns
            if (slot.type === 'break') {
              row.push('BREAK');
              // Fill the rest with empty for horizontal merge
              for (let i = 1; i < previewColumns.length; i++) row.push('');
            } else {
              if (previewColumns.length > 0) {
                previewColumns.forEach(col => {
                  const cellAllocs = getCellAllocs(day, slot.start, col.id);
                  if (cellAllocs.length > 0) {
                    const cellText = cellAllocs.map((a: any) => {
                      const sub = subjects.find(s => s.id === a.subject_id)?.name || 'Unknown Sub';
                      const fac = faculties.find(f => f.id === a.faculty_id)?.name || 'Unknown Fac';
                      const rm = rooms.find(r => r.id === a.room_id)?.name || 'Unknown Room';
                      const batch = a.batches?.length > 0 ? ` [${a.batches.join(',')}]` : '';
                      return `${sub}\n${fac}\n${rm}${batch}`;
                    }).join('\n---\n');
                    row.push(cellText);
                  } else {
                    row.push('');
                  }
                });
              } else {
                row.push('No columns to display');
              }
            }
            wsData.push(row);
          });
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Styling & Merges
        if (!ws['!merges']) ws['!merges'] = [];

        // Title merges
        const maxColIndex = Math.max(headers.length - 1, 1);
        ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: maxColIndex } });
        ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: maxColIndex } });

        let currentRow = 3; // Start of actual data (0-indexed)
        DAYS.forEach(day => {
          // Merge Day column vertically
          ws['!merges']!.push({
            s: { r: currentRow, c: 0 },
            e: { r: currentRow + timeslots.length - 1, c: 0 }
          });

          timeslots.forEach(slot => {
            // Merge Break rows horizontally
            if (slot.type === 'break') {
              ws['!merges']!.push({
                s: { r: currentRow, c: 2 },
                e: { r: currentRow, c: Math.max(maxColIndex, 2) }
              });
            }
            currentRow++;
          });
        });

        // Set column widths
        const colWidths = [{ wch: 12 }, { wch: 18 }];
        for (let i = 0; i < previewColumns.length; i++) {
          colWidths.push({ wch: 30 }); // Wide enough to fit the multiline cell content
        }
        ws['!cols'] = colWidths;

        // Build and save workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Timetable');

        const safeName = selectionLabel.replace(/[^a-zA-Z0-9]/g, '_') || 'Timetable';
        const filename = exportMode === 'all' ? 'All_Timetables.xlsx' : `Timetable_${safeName}.xlsx`;

        XLSX.writeFile(wb, filename);

      }, 'Generating Excel file...');
    } catch (err: any) {
      console.error(err);
      alert('Export failed. Please check the console for details.');
    }
  };

  const handleExport = () => {
    if (selectedType === 'master') {
      downloadExcel('master');
    } else {
      downloadExcel('selected');
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0D0F14] border border-[#2E3345] rounded-2xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ══════ LEFT PANEL ══════ */}
        <div className="w-[280px] min-w-[280px] border-r border-[#2E3345] flex flex-col bg-[#1C1F2A]">
          {/* Header */}
          <div className="p-4 border-b border-[#2E3345] flex justify-between items-center bg-[#2E3345]">
            <h2 className="text-lg font-bold text-[#E5E7EB]">Export Preview</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-themePrimary hover:bg-red-500/80 text-white flex items-center justify-center text-sm font-bold transition">✕</button>
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
                {faculties.map((f: any) => (
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
                {rooms.map((r: any) => (
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
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0D0F14]">
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
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            {/* Title Header mimicking Excel */}
            <div className="mb-4 text-center">
              <div className="text-themeTextMuted text-xs font-bold uppercase tracking-widest mb-1">University Timetable</div>
              <div className="text-[#E5E7EB] text-lg font-bold">{currentConfig?.name || 'Master Timetable'}</div>
              <div className="text-themeTextMuted text-xs mt-1">{selectionLabel} • {currentConfig?.start_time?.slice(0, 5)} – {currentConfig?.end_time?.slice(0, 5)}</div>
            </div>

            <div className="bg-[#2E3345] border border-themeSurface rounded-xl overflow-hidden">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-themeSurface">
                    <th className="border border-themePrimary p-2 text-themeTextMuted-200 font-bold w-[60px] sticky left-0 bg-themeSurface z-10">Day</th>
                    <th className="border border-themePrimary p-2 text-themeTextMuted-200 font-bold w-[100px] sticky bg-themeSurface z-10">Time</th>
                    {previewColumns.length > 0 ? previewColumns.map((col) => (
                      <th key={col.id} className="border border-themePrimary p-2 text-themeTextMuted-200 font-bold min-w-[150px] text-center">
                        {col.label}
                      </th>
                    )) : (
                      <th className="border border-themePrimary p-2 text-themeTextMuted italic">No columns to display</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <React.Fragment key={day}>
                      {timeslots.map((slot: any, slotIdx: number) => (
                        <tr key={`${day}-${slot.start}`} className="bg-[#1C1F2A] hover:bg-[#1C1F2A]/50 transition">
                          {slotIdx === 0 && (
                            <td
                              rowSpan={timeslots.length}
                              className="border border-themePrimary p-2 text-themePrimary-200 font-bold text-center bg-[#2E3345] sticky left-0 z-10"
                              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                            >
                              {day.toUpperCase()}
                            </td>
                          )}
                          <td className="border border-themePrimary p-2 text-themeTextMuted font-medium text-center whitespace-nowrap sticky bg-themeBg/90">
                            {slot.display}
                          </td>
                          {slot.type === 'break' ? (
                            <td
                              colSpan={Math.max(previewColumns.length, 1)}
                              className="border border-themePrimary bg-themeSurface/40 text-center text-themeTextMuted font-bold tracking-[0.3em] uppercase py-3"
                            >
                              ── BREAK ──
                            </td>
                          ) : (
                            previewColumns.length > 0 ? previewColumns.map((col) => {
                              const cellAllocs = getCellAllocs(day, slot.start, col.id);
                              return (
                                <td key={col.id} className="border border-themePrimary p-1.5 align-top min-h-[40px]">
                                  {cellAllocs.length > 0 ? (
                                    <div className="space-y-1">
                                      {cellAllocs.map((a: any) => (
                                        <div key={a.id} className="bg-[#1C1F2A] border border-themePrimary/50 rounded p-1.5 text-[10px] leading-tight">
                                          <div className="font-bold text-themePrimary-200 truncate">{subjects.find((sub: any) => sub.id === a.subject_id)?.name}</div>
                                          <div className="text-themeSecondary truncate">{faculties.find((f: any) => f.id === a.faculty_id)?.name}</div>
                                          <div className="flex justify-between text-themeTextMuted">
                                            <span>{rooms.find((r: any) => r.id === a.room_id)?.name}</span>
                                            {a.batches?.length > 0 && <span className="text-blue-300">{a.batches.join(',')}</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="h-[30px]" />
                                  )}
                                </td>
                              );
                            }) : (
                              <td className="border border-themePrimary p-2 text-slate-600 italic text-center">Select an item to preview</td>
                            )
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}