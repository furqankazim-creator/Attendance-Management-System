import React, { useState } from 'react';
import { CalendarOff, FileEdit, ShieldAlert, Check, X, Hourglass } from 'lucide-react';
import { Avatar, Empty, Pill, fmtHours, usePoll } from '../ui.jsx';

export function Approvals({ api, toast, can, params }) {
  const [tab, setTab] = useState(params?.tab ?? 'leave');
  const [review, setReview] = useState([]);
  const [corr, setCorr] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const w8 = can('approve.write');
  const load = () => { api.get('/punches/review').then(setReview); api.get('/corrections').then(setCorr); api.get('/leaves').then(setLeaves); };
  usePoll(load, 15000);
  const act = (path, decision) => api.post(path, { decision }).then(() => { toast(`Marked ${decision}`); load(); });
  const Btns = ({ path }) => !w8 ? null : (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn sm soft" onClick={() => act(path, 'approved')}><Check size={14} />Approve</button>
      <button className="btn sm danger" onClick={() => act(path, 'rejected')}><X size={14} />Reject</button>
    </div>
  );
  const pend = (a, k = 'state') => a.filter((x) => x[k] === 'pending').length;
  const tabs = [['leave', 'Leave requests', CalendarOff, pend(leaves)], ['corr', 'Corrections', FileEdit, pend(corr)], ['risk', 'High-risk punches', ShieldAlert, review.length]];
  return (
    <>
      <div className="page-head"><div><h1>Approvals</h1><p>Review requests from your team.{!w8 && ' You have read-only access.'}</p></div></div>
      <div className="tabs">{tabs.map(([k, label, Icon, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={16} />{label}{n > 0 && <span className="badge">{n}</span>}</button>)}</div>
      <div className="card">
        {tab === 'leave' && (leaves.length === 0 ? <Empty text="No leave requests." /> : (
          <div className="tscroll"><table className="table"><thead><tr><th>Employee</th><th>Dates</th><th>Type</th><th>Reason</th><th>Status</th><th /></tr></thead>
            <tbody>{leaves.map((l) => <tr key={l.id}><td><div className="who"><Avatar name={l.name} size={34} /><b>{l.name}</b></div></td><td>{l.from_day} to {l.to_day}</td><td style={{ textTransform: 'capitalize' }}>{l.type}</td><td className="muted">{l.reason}</td><td><Pill v={l.state} /></td>
              <td>{l.state === 'pending' && <Btns path={`/leaves/${l.id}/decision`} />}</td></tr>)}</tbody></table></div>))}
        {tab === 'corr' && (corr.length === 0 ? <Empty text="No correction requests." /> : (
          <div className="tscroll"><table className="table"><thead><tr><th>Employee</th><th>Request</th><th>Reason</th><th>Status</th><th /></tr></thead>
            <tbody>{corr.map((c) => <tr key={c.id}><td><div className="who"><Avatar name={c.name} size={34} /><b>{c.name}</b></div></td><td>Check {c.kind} at <b>{c.requested_time}</b> on {c.day}</td><td className="muted">{c.reason}</td><td><Pill v={c.state} /></td>
              <td>{c.state === 'pending' && <Btns path={`/corrections/${c.id}/decision`} />}</td></tr>)}</tbody></table></div>))}
        {tab === 'risk' && (review.length === 0 ? <Empty text="No punches need review." /> : (
          <div className="tscroll"><table className="table"><thead><tr><th>Employee</th><th>When</th><th>Why it was flagged</th><th /></tr></thead>
            <tbody>{review.map((p) => <tr key={p.id}><td><div className="who"><Avatar name={p.name} size={34} /><b>{p.name}</b></div></td><td>{new Date(p.server_ts).toLocaleString()}</td>
              <td>{JSON.parse(p.risk_reasons).map((r) => <span key={r} className="pill p-bad" style={{ marginRight: 6 }}>{r.replaceAll('_', ' ')}</span>)}</td>
              <td><Btns path={`/punches/${p.id}/review`} /></td></tr>)}</tbody></table></div>))}
      </div>
    </>
  );
}

export function Timesheets({ api, toast, can }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('submitted');
  const load = () => api.get('/timesheets').then(setRows);
  usePoll(load, 20000);
  const decide = async (id, decision) => {
    const note = decision === 'rejected' ? prompt('Reason for the employee (optional):') ?? '' : null;
    await api.post(`/timesheets/${id}/decision`, { decision, note }); toast(`Timesheet ${decision}`); load();
  };
  const shown = rows.filter((r) => filter === 'all' || r.state === filter);
  return (
    <>
      <div className="page-head"><div><h1>Timesheets</h1><p>Weekly hours submitted by employees, after breaks.</p></div>
        <div className="seg">{['submitted', 'approved', 'rejected', 'all'].map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>)}</div></div>
      <div className="card">
        {shown.length === 0 ? <Empty text="No timesheets here." /> : (
          <div className="tscroll"><table className="table"><thead><tr><th>Employee</th><th>Week of</th><th>Total</th><th>Status</th><th>Note</th><th /></tr></thead>
            <tbody>{shown.map((t) => <tr key={t.id}><td><div className="who"><Avatar name={t.name} size={34} /><b>{t.name}</b></div></td><td>{t.week_start}</td>
              <td><b>{fmtHours(t.total_ms)}</b></td><td><Pill v={t.state} /></td><td className="muted">{t.note}</td>
              <td>{t.state === 'submitted' && can('approve.write') && <div className="row" style={{ gap: 6 }}><button className="btn sm soft" onClick={() => decide(t.id, 'approved')}><Check size={14} />Approve</button><button className="btn sm danger" onClick={() => decide(t.id, 'rejected')}><X size={14} />Reject</button></div>}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </>
  );
}
