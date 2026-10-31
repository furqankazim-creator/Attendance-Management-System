import React, { useCallback, useState } from 'react';
import { Users, UserCheck, UserX, Clock, CalendarOff, LogOut, Plus, MapPinPlus, BellRing, Hourglass, CalendarClock, Radio, ShieldAlert, Check } from 'lucide-react';
import { Avatar, Donut, Empty, Pill, TrendChart, fmtHours, usePoll } from '../ui.jsx';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);
const toneColor = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)' };

const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const dutyTone = { warn: ['var(--warn-soft)', 'var(--warn)'], bad: ['var(--bad-soft)', 'var(--bad)'], info: ['var(--info-soft)', 'var(--info)'] };

function DutyAlerts({ api, can }) {
  const [a, setA] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => api.get('/alerts').then((r) => { setA(r); setFailed(false); }).catch(() => setFailed(true)), [api]);
  usePoll(load, 12000);
  const markAll = () => api.post('/alerts/seen', {}).then(load).catch(() => {});
  return (
    <div className="card">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldAlert size={17} />On-duty alerts
        {a?.unseen > 0 && <span className="pill p-warn" style={{ marginLeft: 4 }}>{a.unseen} new</span>}
        <span style={{ flex: 1 }} />
        {a?.unseen > 0 && can('approve.write') && <button className="btn soft sm" onClick={markAll}><Check size={14} />Mark all seen</button>}
      </h3>
      {failed && !a ? <Empty text="Could not load alerts." /> : !a ? <div className="muted">Loading...</div> : a.items.length === 0
        ? <Empty text="No one has left the work area during a shift." />
        : a.items.slice(0, 6).map((x) => {
          const [bg, fg] = dutyTone[x.tone] ?? dutyTone.info;
          return (
            <div className="alert-i" key={x.id} style={{ opacity: x.seen ? 0.6 : 1 }}>
              <div className="ico" style={{ background: bg, color: fg }}><ShieldAlert size={18} /></div>
              <div><b style={{ fontWeight: x.seen ? 600 : 700 }}>{x.text}</b><div className="muted" style={{ fontSize: 12 }}>{ago(x.at)}</div></div>
            </div>
          );
        })}
    </div>
  );
}

export default function Dashboard({ api, me, go, can }) {
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get('/dashboard').then(setD).catch(() => {}), [api]);
  usePoll(load, 12000);
  if (!d) return <div className="empty">Loading dashboard...</div>;
  const o = d.overview;
  const presentOnTime = o.present - o.late;
  const parts = [
    { label: 'On time', value: presentOnTime, color: 'var(--ok)' },
    { label: 'Late', value: o.late, color: 'var(--warn)' },
    { label: 'Absent', value: o.absent, color: 'var(--bad)' },
    { label: 'On leave', value: o.leave, color: 'var(--violet)' },
    { label: 'Not yet in', value: o.expected, color: 'var(--grey)' },
  ];
  return (
    <>
      <div className="hero">
        <h2>{greet()}, {me.name.split(' ')[0]}</h2>
        <p>{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · here is how your workforce is doing right now.</p>
        <div className="actions">
          {can('workers.write') && <button className="btn white" onClick={() => go('employees', { add: true })}><Plus size={16} />Add employee</button>}
          {can('sites.write') && <button className="btn glass" onClick={() => go('locations', { add: true })}><MapPinPlus size={16} />Add location</button>}
          <button className="btn glass" onClick={() => go('attendance')}><Radio size={16} />Open live tracking</button>
        </div>
        <div className="chips">
          <div className="chip"><b>{o.present}</b><span>Present now</span></div>
          <div className="chip"><b>{pct(o.present, o.total)}%</b><span>Attendance rate</span></div>
          <div className="chip"><b>{fmtHours(o.avg_ms)}</b><span>Avg hours today</span></div>
        </div>
      </div>

      <div className="grid g6" style={{ marginBottom: 18 }}>
        {[
          [Users, 'Total employees', o.total, 'primary'], [UserCheck, 'Present', o.present, 'ok'], [UserX, 'Absent', o.absent, 'bad'],
          [CalendarOff, 'On leave', o.leave, 'violet'], [Clock, 'Late arrivals', o.late, 'warn'], [LogOut, 'Early check-out', o.early, 'info'],
        ].map(([Icon, label, value, tone]) => (
          <div className="stat" key={label}>
            <div className="ico" style={{ background: `var(--${tone === 'primary' ? 'primary-soft' : tone + '-soft'})`, color: `var(--${tone === 'primary' ? 'primary' : tone})` }}><Icon size={22} /></div>
            <div><div className="n">{value}</div><div className="l">{label}</div></div>
          </div>
        ))}
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Overview <span className="muted" style={{ fontWeight: 600, fontSize: 12.5 }}>{d.today}</span></h3>
          <div className="donut-wrap">
            <Donut parts={parts} total={o.total} center={`${pct(o.present, o.total)}%`} sub="present" />
            <div className="legend">
              <div><i style={{ background: 'var(--ink)' }} />Total<b>{o.total}</b></div>
              {parts.map((p) => <div key={p.label}><i style={{ background: p.color }} />{p.label}<b>{p.value}</b></div>)}
            </div>
          </div>
          <p className="muted" style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}><Hourglass size={15} />Average worked time today: <b style={{ color: 'var(--ink)' }}>{fmtHours(o.avg_ms)}</b></p>
        </div>

        <div className="card">
          <h3>Department-wise attendance</h3>
          {d.departments.length === 0 ? <Empty text="Add employees to see departments." /> : (
            <div className="tscroll">
              <table className="table">
                <thead><tr><th>Department</th><th>Avg hours</th><th>Total</th><th>Present</th><th>Absent</th><th>Leave</th><th>Late</th><th>Early out</th></tr></thead>
                <tbody>{d.departments.map((x) => (
                  <tr key={x.department}>
                    <td><b style={{ color: 'var(--primary)' }}>{x.department}</b></td><td>{fmtHours(x.avg_ms)}</td><td>{x.total}</td>
                    <td><b>{x.present}</b> <span className="muted">({pct(x.present, x.total)}%)</span></td>
                    <td>{x.absent}</td><td>{x.leave}</td><td>{x.late}</td><td>{x.early}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid g3">
        <div className="card">
          <h3>Attendance trend <span className="muted" style={{ fontWeight: 600, fontSize: 12.5 }}>last 30 days</span></h3>
          {d.trend.length === 0 ? <Empty text="No attendance history yet." /> : <TrendChart data={d.trend} />}
        </div>
        <div>
          <DutyAlerts api={api} can={can} />
          <div className="card">
            <h3>Alerts &amp; actions</h3>
            <div className="alert-i"><div className="ico" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}><CalendarOff size={18} /></div>
              <div><b>Unapproved leaves</b><div className="muted">{d.alerts.pendingLeave ? `${d.alerts.pendingLeave} request(s) waiting` : 'No pending requests'}</div>
                {d.alerts.pendingLeave > 0 && <button className="btn soft sm" style={{ marginTop: 6 }} onClick={() => go('approvals')}>Review now</button>}</div></div>
            <div className="alert-i"><div className="ico" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><BellRing size={18} /></div>
              <div><b>Late arrivals (last 3 days)</b><div className="muted">{d.alerts.recentLate.length ? d.alerts.recentLate.slice(0, 4).join(', ') + (d.alerts.recentLate.length > 4 ? ` +${d.alerts.recentLate.length - 4}` : '') : 'All good! Everyone is on time.'}</div></div></div>
            <div className="alert-i"><div className="ico" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><CalendarClock size={18} /></div>
              <div><b>Next shift</b><div className="muted">{d.alerts.nextShift ?? 'No shifts set'}</div></div></div>
          </div>
          <div className="card feed">
            <h3>Live tracking</h3>
            {d.feed.length === 0 ? <Empty text="No activity yet." /> : d.feed.slice(0, 6).map((f, i) => (
              <div className="item" key={i}>
                <span className="dot" style={{ background: toneColor[f.tone] }} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{f.text}</div><div className="muted" style={{ fontSize: 12 }}>{new Date(f.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
