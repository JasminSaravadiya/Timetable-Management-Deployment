import React, { useEffect, useState, useMemo } from 'react';
import { parse, addMinutes, isBefore, format } from 'date-fns';
import { API_URL } from '../config';

const API_BASE = API_URL;

interface Allocation {
  id: number;
  day_of_week: string;
  start_time: string;
  duration_minutes: number;
  batches: string[];
  subject: string;
  faculty: string;
  room: string;
  semester: string;
  branch: string;
}

interface TimetableData {
  metadata: {
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
    breaks: any[];
  };
  allocations: Allocation[];
}

const SUBJECT_COLORS = [
  { bg: 'rgba(196,181,253,0.12)', border: 'rgba(196,181,253,0.3)', text: '#C4B5FD' },   // lavender
  { bg: 'rgba(163,230,53,0.10)', border: 'rgba(163,230,53,0.25)', text: '#A3E635' },     // mint
  { bg: 'rgba(103,232,249,0.10)', border: 'rgba(103,232,249,0.25)', text: '#67E8F9' },   // cyan
  { bg: 'rgba(253,230,138,0.10)', border: 'rgba(253,230,138,0.25)', text: '#FDE68A' },   // yellow
  { bg: 'rgba(249,168,212,0.10)', border: 'rgba(249,168,212,0.25)', text: '#F9A8D4' },   // pink
  { bg: 'rgba(110,231,183,0.10)', border: 'rgba(110,231,183,0.25)', text: '#6EE7B7' },   // emerald
];

export default function PublicView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<TimetableData | null>(null);
  const [lastPublished, setLastPublished] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedSem, setSelectedSem] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('All Days');

  useEffect(() => {
    fetch(`${API_BASE}/view/timetable`)
      .then(res => res.json())
      .then(res => {
        if (!res.published) {
          setError('No timetable is currently published.');
        } else {
          setData(res.data);
          setLastPublished(res.published_at);
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load timetable data.');
      })
      .finally(() => setLoading(false));
  }, []);

  const branches = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.allocations.map(a => a.branch))).filter(Boolean).sort();
  }, [data]);

  const semesters = useMemo(() => {
    if (!data || !selectedBranch) return [];
    return Array.from(
      new Set(data.allocations.filter(a => a.branch === selectedBranch).map(a => a.semester))
    ).filter(Boolean).sort();
  }, [data, selectedBranch]);

  useEffect(() => {
    if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0]);
    }
  }, [branches, selectedBranch]);

  useEffect(() => {
    if (semesters.length > 0 && (!selectedSem || !semesters.includes(selectedSem))) {
      setSelectedSem(semesters[0]);
    }
  }, [semesters, selectedSem]);

  if (loading) {
    return (
      <div style={{ background: '#0D0F14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin h-10 w-10 border-4 border-[#C4B5FD] rounded-full border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#0D0F14', color: '#E5E7EB', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#1C1F2A', border: '1px solid #2E3345', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 16 }}>🚫</div>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Unavailable</h1>
        <p style={{ color: '#9CA3AF', marginTop: 8 }}>{error}</p>
      </div>
    );
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let filteredAllocs = data?.allocations.filter(
    a => a.branch === selectedBranch && a.semester === selectedSem
  ) || [];

  filteredAllocs.sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Generate Timeslots
  const generateTimeslots = () => {
    if (!data?.metadata) return [];
    const slots = [];
    const breaks = data.metadata.breaks || [];

    const start = parse(data.metadata.start_time, 'HH:mm:ss', new Date());
    const end = parse(data.metadata.end_time, 'HH:mm:ss', new Date());
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
        const slotEnd = addMinutes(current, data.metadata.slot_duration_minutes);
        slots.push({
          type: 'slot',
          start: currentStr,
          end: format(slotEnd, 'HH:mm:ss'),
          display: `${format(current, 'HH:mm')} - ${format(slotEnd, 'HH:mm')}`,
          duration_minutes: data.metadata.slot_duration_minutes
        });
        current = slotEnd;
      }
    }
    return slots;
  };

  const timeslots = generateTimeslots();

  return (
    <div style={{ minHeight: '100vh', background: '#0D0F14', color: '#E5E7EB', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient glow orbs */}
      <div style={{ position: 'absolute', top: '-120px', left: '-120px', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,181,253,0.08) 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-100px', right: '-100px', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(103,232,249,0.06) 0%, transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none' }} />
      
      <header style={{ background: 'rgba(28, 31, 42, 0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #2E3345', position: 'sticky', top: 0, zIndex: 10, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg, #C4B5FD, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>Student Timetable</h1>
            {lastPublished && (
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: '4px 0 0' }}>Last updated: {new Date(lastPublished + 'Z').toLocaleString()}</p>
            )}
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Select value={selectedBranch} onChange={setSelectedBranch} options={branches.map(b => ({label: b, value: b}))} />
            <Select value={selectedSem} onChange={setSelectedSem} options={semesters.map(s => ({label: s, value: s}))} />
            <Select value={selectedDay} onChange={setSelectedDay} options={[{label: 'All Days', value: 'All Days'}, ...days.map(d => ({label: d, value: d}))]} />
          </div>
        </div>
      </header>
      
      <main style={{ flex: 1, padding: '24px', maxWidth: '100%', width: '100%', zIndex: 1, position: 'relative' }}>
        {filteredAllocs.length === 0 && selectedDay !== 'All Days' ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF' }}>
            No classes scheduled for the selected criteria.
          </div>
        ) : selectedDay !== 'All Days' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 800, margin: '0 auto', width: '100%' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#E5E7EB', borderBottom: '2px solid #2E3345', paddingBottom: 12 }}>{selectedDay}</h2>
            
            <div style={{ background: '#1C1F2A', border: '1px solid #2E3345', borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
              {timeslots.map((timeObj, idx) => {
                const isLastRow = idx === timeslots.length - 1;
                
                if (timeObj.type === 'break') {
                  return (
                    <div key={idx} style={{ display: 'flex', borderBottom: isLastRow ? 'none' : '1px solid #2E3345', background: 'rgba(253,230,138,0.05)' }}>
                      <div style={{ padding: '16px', minWidth: 100, borderRight: '1px solid #2E3345', color: '#9CA3AF', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                        {timeObj.display.replace(' - ', '\n')}
                      </div>
                      <div style={{ flex: 1, padding: '16px', color: '#FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.1em', fontWeight: 700 }}>
                        ☕ BREAK ({timeObj.duration_minutes} MIN)
                      </div>
                    </div>
                  );
                }
                
                const cellAllocs = filteredAllocs.filter(a => a.day_of_week === selectedDay && a.start_time === timeObj.start);
                
                return (
                  <div key={idx} style={{ display: 'flex', borderBottom: isLastRow ? 'none' : '1px solid #2E3345' }}>
                    <div style={{ padding: '16px', minWidth: 100, borderRight: '1px solid #2E3345', background: '#262A36', color: '#9CA3AF', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                      {timeObj.display.replace(' - ', '\n')}
                    </div>
                    <div style={{ flex: 1, padding: '16px', background: '#0D0F14' }}>
                      {cellAllocs.length === 0 ? (
                        <div style={{ color: '#4B5563', fontSize: 14, fontStyle: 'italic', display: 'flex', alignItems: 'center', height: '100%' }}>No classes scheduled</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {cellAllocs.map((a, allocIdx) => {
                            const colorScheme = SUBJECT_COLORS[allocIdx % SUBJECT_COLORS.length];
                            return (
                              <div key={a.id} style={{ background: colorScheme.bg, borderLeft: `4px solid ${colorScheme.text}`, borderRadius: 8, padding: '12px 16px' }}>
                                <div style={{ fontWeight: 800, fontSize: 16, color: colorScheme.text, marginBottom: 8 }}>{a.subject}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#E5E7EB' }}><span style={{ fontSize: 16 }}>👤</span> {a.faculty}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#E5E7EB' }}><span style={{ fontSize: 16 }}>🚪</span> {a.room}</div>
                                  {a.batches && a.batches.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#FDE68A', fontWeight: 700 }}>
                                      <span style={{ fontSize: 16 }}>👥</span> {a.batches.join(', ')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: '#1C1F2A', border: '1px solid #2E3345', borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '100px', background: '#262A36', padding: '16px', borderBottom: '1px solid #2E3345', borderRight: '1px solid #2E3345', color: '#9CA3AF', fontSize: 13 }}>Time</th>
                  {days.map(day => (
                    <th key={day} style={{ background: '#262A36', padding: '16px', borderBottom: '1px solid #2E3345', borderRight: '1px solid #2E3345', color: '#E5E7EB', fontSize: 14 }}>
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeslots.map((timeObj, idx) => {
                   const isLastRow = idx === timeslots.length - 1;
                   return (
                     <tr key={idx}>
                       <td style={{ padding: '12px', borderBottom: isLastRow ? 'none' : '1px solid #2E3345', borderRight: '1px solid #2E3345', color: '#9CA3AF', fontSize: 12, textAlign: 'center', background: '#1C1F2A', fontWeight: 600 }}>
                         {timeObj.display.replace(' - ', '\n')}
                       </td>
                       {timeObj.type === 'break' ? (
                         <td colSpan={days.length} style={{ background: 'rgba(253,230,138,0.05)', color: '#FDE68A', textAlign: 'center', borderBottom: isLastRow ? 'none' : '1px solid #2E3345', padding: '16px', letterSpacing: '0.1em' }}>
                           ☕ BREAK ({timeObj.duration_minutes} MIN)
                         </td>
                       ) : (
                         days.map(day => {
                           const cellAllocs = filteredAllocs.filter(a => a.day_of_week === day && a.start_time === timeObj.start);
                           return (
                             <td key={day} style={{ padding: '6px', borderBottom: isLastRow ? 'none' : '1px solid #2E3345', borderRight: '1px solid #2E3345', verticalAlign: 'top', background: '#0D0F14' }}>
                               {cellAllocs.length === 0 ? (
                                 <div style={{ minHeight: '60px' }} />
                               ) : (
                                 <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', height: '100%' }}>
                                   {cellAllocs.map((a, allocIdx) => {
                                     const colorScheme = SUBJECT_COLORS[allocIdx % SUBJECT_COLORS.length];
                                     return (
                                       <div key={a.id} style={{ background: colorScheme.bg, border: `1px solid ${colorScheme.border}`, borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minHeight: '60px' }}>
                                         <div style={{ fontWeight: 700, fontSize: 12, color: colorScheme.text, lineHeight: 1.2 }}>{a.subject}</div>
                                         <div style={{ fontSize: 11, color: '#67E8F9', marginTop: 4 }}>{a.faculty}</div>
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                           <span style={{ fontSize: 10, color: '#9CA3AF', background: '#262A36', padding: '2px 6px', borderRadius: 4 }}>{a.room}</span>
                                           {a.batches && a.batches.length > 0 && <span style={{ fontSize: 10, color: '#FDE68A', fontWeight: 'bold' }}>{a.batches.join(', ')}</span>}
                                         </div>
                                       </div>
                                     );
                                   })}
                                 </div>
                               )}
                             </td>
                           );
                         })
                       )}
                     </tr>
                   );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string, onChange: (v: any) => void, options: {label: string, value: string}[] }) {
  return (
    <select 
      value={value} 
      onChange={e => onChange(e.target.value)}
      style={{
        background: '#1C1F2A',
        color: '#E5E7EB',
        border: '1px solid #2E3345',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        outline: 'none',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}


