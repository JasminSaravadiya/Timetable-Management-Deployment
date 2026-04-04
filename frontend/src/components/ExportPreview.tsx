import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { API_URL } from '../config';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ExportPreview() {
  const { currentConfig } = useStore();
  const navigate = useNavigate();

  const [allocations, setAllocations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [filterType, setFilterType] = useState('all'); // all, semester, faculty, room
  const [filterId, setFilterId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [alloc, b, s, sub, fac, rm] = await Promise.all([
      axios.get(`${API_URL}/allocations`),
      axios.get(`${API_URL}/branches`),
      axios.get(`${API_URL}/semesters`),
      axios.get(`${API_URL}/subjects`),
      axios.get(`${API_URL}/faculties`),
      axios.get(`${API_URL}/rooms`)
    ]);
    if (currentConfig) {
      setAllocations(alloc.data.filter((a: any) => a.config_id === currentConfig.id));
    }
    setBranches(b.data);
    setSemesters(s.data);
    setSubjects(sub.data);
    setFaculties(fac.data);
    setRooms(rm.data);
  };

  const getFilteredData = () => {
    let filtered = allocations;
    if (filterType === 'semester' && filterId) {
      filtered = allocations.filter((a: any) => String(a.semester_id) === filterId);
    } else if (filterType === 'faculty' && filterId) {
      filtered = allocations.filter((a: any) => String(a.faculty_id) === filterId);
    } else if (filterType === 'room' && filterId) {
      filtered = allocations.filter((a: any) => String(a.room_id) === filterId);
    }

    return filtered.map((a: any) => {
      const sem = semesters.find((s: any) => s.id === a.semester_id);
      const branch = branches.find((b: any) => b.id === (sem as any)?.branch_id);
      return {
        Day: a.day_of_week,
        StartTime: a.start_time,
        DurationMins: a.duration_minutes,
        Branch: (branch as any)?.name,
        Semester: (sem as any)?.name,
        Subject: (subjects.find((sub: any) => sub.id === a.subject_id) as any)?.name,
        Faculty: (faculties.find((f: any) => f.id === a.faculty_id) as any)?.name,
        Room: (rooms.find((r: any) => r.id === a.room_id) as any)?.name,
        Batch: a.batch_name || 'All'
      };
    });
  };

  const exportData = getFilteredData();

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timetable");
    XLSX.writeFile(wb, `${currentConfig?.name || 'Master'}_Timetable.xlsx`);
  };

  return (
    <div className="flex h-screen bg-[#0D0F14] text-[#E5E7EB]">
      {/* Sidebar Controls */}
      <div className="w-80 bg-[#1C1F2A] border-r border-[#2E3345] p-6 flex flex-col shadow-xl z-10">
        <h2 className="text-2xl font-black text-[#E5E7EB] mb-8 border-b border-[#2E3345] pb-4">Export Options</h2>

        <div className="flex flex-col gap-6 flex-1">
          <label className="flex flex-col gap-2">
            <span className="font-bold text-sm text-themeTextMuted uppercase tracking-widest">Filter By</span>
            <select className="p-3 bg-[#242838] border border-themeSurface rounded-lg focus:border-themePrimary focus:ring-1 focus:ring-themePrimary font-medium"
              value={filterType} onChange={(e) => { setFilterType(e.target.value); setFilterId(''); }}>
              <option value="all">Master (All Data)</option>
              <option value="semester">Specific Semester</option>
              <option value="faculty">Specific Faculty</option>
              <option value="room">Specific Room</option>
            </select>
          </label>

          {filterType === 'semester' && (
            <select className="p-3 bg-[#242838] border border-themeSurface rounded-lg focus:border-themePrimary focus:ring-1 focus:ring-themePrimary"
              value={filterId} onChange={(e) => setFilterId(e.target.value)}>
              <option value="">Select Semester...</option>
              {semesters.map((s: any) => <option key={s.id} value={s.id}>{s.name} (Branch {s.branch_id})</option>)}
            </select>
          )}

          {filterType === 'faculty' && (
            <select className="p-3 bg-[#242838] border border-themeSurface rounded-lg focus:border-themePrimary focus:ring-1 focus:ring-themePrimary"
              value={filterId} onChange={(e) => setFilterId(e.target.value)}>
              <option value="">Select Faculty...</option>
              {faculties.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}

          {filterType === 'room' && (
            <select className="p-3 bg-[#242838] border border-themeSurface rounded-lg focus:border-themePrimary focus:ring-1 focus:ring-themePrimary"
              value={filterId} onChange={(e) => setFilterId(e.target.value)}>
              <option value="">Select Room...</option>
              {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>

        <button onClick={handleExportExcel} className="mt-8 btn-primary flex justify-between items-center group w-full">
          <span>Download Excel</span>
          <span className="group-hover:translate-x-1 transition-transform">&darr;</span>
        </button>

        <button onClick={() => navigate('/grid')} className="mt-4 px-6 py-4 bg-[#2E3345] hover:bg-[#2E3345] text-[#9CA3AF] hover:text-[#E5E7EB] font-bold rounded-xl transition-all w-full">
          &larr; Back to Grid
        </button>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 p-8 overflow-auto flex flex-col" style={{ minWidth: 0 }}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-themeTextMain">
            Preview Data Grid
          </h1>
          <div className="px-4 py-2 bg-[#C4B5FD]/10 text-[#C4B5FD] border border-[#C4B5FD]/30 rounded-full font-bold text-sm">
            {exportData.length} records matching '{filterType}'
          </div>
        </div>

        <div className="flex-1 bg-[#1C1F2A] rounded-2xl shadow-lg border border-[#2E3345] overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#262A36] sticky top-0 border-b border-[#2E3345] shadow-sm z-10">
              <tr>
                {['Day', 'Start', 'Dur(m)', 'Branch', 'Sem', 'Subject', 'Faculty', 'Room', 'Batch'].map(header => (
                  <th key={header} className="p-4 text-xs font-black text-themeTextMuted uppercase tracking-widest">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exportData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-themeTextMuted italic font-medium">No records to preview.</td>
                </tr>
              ) : (
                exportData.map((row: any, idx: number) => (
                  <tr key={idx} className="border-b border-themeSurface hover:bg-[#0D0F14] transition-colors">
                    <td className="p-4 font-semibold text-themeTextMain">{row.Day}</td>
                    <td className="p-4 text-themeTextMuted">{row.StartTime.slice(0, 5)}</td>
                    <td className="p-4 text-themeTextMuted">{row.DurationMins}</td>
                    <td className="p-4 font-medium text-themePrimary">{row.Branch}</td>
                    <td className="p-4 text-themeTextMuted">{row.Semester}</td>
                    <td className="p-4 font-medium text-themeTextMain">{row.Subject}</td>
                    <td className="p-4 text-themeSecondary font-semibold">{row.Faculty}</td>
                    <td className="p-4 font-mono text-themeTextMuted text-sm bg-themeSurface rounded px-2 py-1 mx-2">{row.Room}</td>
                    <td className="p-4 text-themeTextMuted">{row.Batch}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
