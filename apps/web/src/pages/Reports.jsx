import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, Users, CheckCircle2, Clock, Timer } from 'lucide-react';
import { Avatar, Empty, Pill, StatCard, fmtHours, fmtTime, todayISO, usePoll } from '../ui.jsx';
import { BASE } from '../api.js';

export function Reports({ api, token }) {
  const today = todayISO();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const query = `?from=${from}&to=${to}`;
  useEffect(() => { api.get(`/reports/attendance${query}`).then(setRows); }, [query]);
  usePoll(() => api.get(`/reports/attendance${query}`).then(setRows), 30000, false);
  const shown = rows.filter((r) => r.worker.toLowerCase().includes(q.toLowerCase()));
  const sum = useMemo(() => ({
    present: shown.filter((r) => r.status === 'present').length, late: shown.filter((r) => r.status === 'late').length,
    hours: shown.reduce((a, r) => a + r.hours, 0),
    people: new Set(shown.map((r) => r.worker)).size,
  }), [shown]);
  const perPerson = useMemo(() => {
    const m = {};
    shown.forEach((r) => { m[r.worker] ??= { name: r.worker, days: 0, late: 0, hours: 0 }; m[r.worker].days++; m[r.worker].hours += r.hours; if (r.status === 'late') m[r.worker].late++; });
    return Object.values(m).sort((a, b) => b.hours - a.hours);
  }, [shown]);
  const maxH = Math.max(1, ...perPerson.map((p) => p.hours));
  const csv = async () => {
    const res = await fetch(`${BASE}/reports/attendance${query}&format=csv`, { headers: { authorization: `Bearer ${token}` } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `attendance_${from}_${to}.csv`; a.click();
  };
  return (
    <>
      <div className="page-head"><div><h1>Reports</h1><p>Attendance summary and payroll-ready export.</p></div>
        <div className="row"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="muted">to</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn primary" onClick={csv}><Download size={16} />Export CSV</button></div></div>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <StatCard icon={Users} label="Employees" value={sum.people} />
        <StatCard icon={CheckCircle2} label="On-time days" value={sum.present} tone="ok" />
        <StatCard icon={Clock} label="Late days" value={sum.late} tone="warn" />
        <StatCard icon={Timer} label="Hours worked" value={sum.hours.toFixed(1)} tone="violet" />
      </div>
      <div className="grid g3">
        <div className="card">
          <div className="card-h"><span>Daily records</span><div className="search" style={{ maxWidth: 240 }}><Search size={16} /><input placeholder="Search employee" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
          {shown.length === 0 ? <Empty text="No records in this range." /> : (
            <div className="tscroll"><table className="table"><thead><tr><th>Employee</th><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th><th>Risk</th></tr></thead>
              <tbody>{shown.map((r, i) => <tr key={i}><td><div className="who"><Avatar name={r.worker} size={32} /><b>{r.worker}</b></div></td><td>{r.day}</td><td>{fmtTime(r.check_in)}</td><td>{fmtTime(r.check_out)}</td><td>{fmtHours(r.hours * 3600000)}</td><td><Pill v={r.status} /></td><td><Pill v={r.risk} /></td></tr>)}</tbody></table></div>
          )}
        </div>
        <div className="card">
          <h3>Hours by employee</h3>
          {perPerson.length === 0 ? <Empty text="No data." /> : perPerson.slice(0, 10).map((p) => (
            <div key={p.name} style={{ marginBottom: 14 }}>
              <div className="row between"><div className="who"><Avatar name={p.name} size={28} /><b>{p.name}</b></div><b>{p.hours.toFixed(1)}h</b></div>
              <div className="bar-track" style={{ marginTop: 6 }}><i style={{ width: `${(p.hours / maxH) * 100}%` }} /></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{p.days} day(s) · {p.late} late</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function Audit({ api }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  usePoll(() => api.get('/audit').then(setRows), 20000);
  const shown = rows.filter((a) => (a.action + a.detail).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head"><div><h1>Audit log</h1><p>Every change and review decision, newest first.</p></div>
        <div className="search"><Search size={16} /><input placeholder="Filter actions" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      <div className="card">
        {shown.length === 0 ? <Empty text="No activity yet." /> : (
          <div className="tscroll"><table className="table"><thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>{shown.map((a) => <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{new Date(a.ts).toLocaleString()}</td><td><span className="pill p-info">{a.action.replaceAll('_', ' ')}</span></td><td className="muted" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{a.detail}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </>
  );
}
