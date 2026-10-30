import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, ChevronLeft, ChevronRight, Radio, ClipboardList, CalendarRange, Download } from 'lucide-react';
import { Avatar, Empty, Pill, colorFor, fmtHours, fmtTime, initials, todayISO, usePoll } from '../ui.jsx';
import { BASE } from '../api.js';

const DOT = { in: 'var(--ok)', left: 'var(--grey)', late: 'var(--warn)', absent: 'var(--bad)', expected: 'var(--info)' };
const shiftDay = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

function pinIcon(name, color, selected) {
  return L.divIcon({
    className: '', iconSize: [44, 54], iconAnchor: [22, 52],
    html: `<div class="pin ${selected ? 'sel' : ''}"><div class="bub" style="background:linear-gradient(135deg,${color},${colorFor(name + 'x')})"><span>${initials(name)}</span></div></div>`,
  });
}

function LiveTracking({ api }) {
  const [day, setDay] = useState(todayISO());
  const [map, setMap] = useState(null);
  const [board, setBoard] = useState([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const el = useRef(null), m = useRef(null), layer = useRef(null), fitted = useRef(false);

  const load = useCallback(() => {
    api.get(`/map?day=${day}`).then(setMap).catch(() => {});
    api.get('/board').then(setBoard).catch(() => {});
  }, [api, day]);
  usePoll(load, 12000);
  useEffect(() => { load(); }, [day]);

  useEffect(() => {
    m.current = L.map(el.current, { zoomControl: true }).setView([24.8607, 67.0011], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(m.current);
    layer.current = L.layerGroup().addTo(m.current);
    return () => m.current.remove();
  }, []);

  const byId = useMemo(() => Object.fromEntries((map?.workers ?? []).map((w) => [w.id, w])), [map]);
  useEffect(() => {
    if (!map) return;
    layer.current.clearLayers();
    const bounds = [];
    map.sites.forEach((s) => {
      const shape = s.type === 'circle' ? L.circle([s.lat, s.lng], { radius: s.radius_m, color: '#4f46e5', weight: 2, fillOpacity: 0.12 }) : L.polygon(s.points, { color: '#4f46e5', weight: 2, fillOpacity: 0.12 });
      shape.bindTooltip(s.name, { sticky: true }).addTo(layer.current); bounds.push(shape.getBounds());
    });
    map.workers.forEach((w) => {
      const c = w.last.risk === 'high' ? '#ef4444' : colorFor(w.name);
      if (sel === w.id && w.points.length > 1) L.polyline(w.points.map((p) => [p.lat, p.lng]), { color: c, dashArray: '6 8', weight: 3 }).addTo(layer.current);
      L.marker([w.last.lat, w.last.lng], { icon: pinIcon(w.name, c, sel === w.id), zIndexOffset: sel === w.id ? 1000 : 0 })
        .bindTooltip(`<b>${w.name}</b><br>${w.last.kind === 'in' ? 'Checked in' : 'Checked out'} ${fmtTime(w.last.at)}${w.last.source === 'kiosk' ? ' (kiosk)' : w.last.source === 'auto' ? ' (automatic)' : ''}`, { direction: 'top', offset: [0, -48] })
        .on('click', () => setSel(w.id)).addTo(layer.current);
      bounds.push(L.latLngBounds([[w.last.lat, w.last.lng]]));
    });
    if (bounds.length && !fitted.current) { m.current.fitBounds(bounds.reduce((a, b) => a.extend(b)), { maxZoom: 17, padding: [50, 50] }); fitted.current = true; }
  }, [map, sel]);

  const list = board.filter((w) => w.name.toLowerCase().includes(q.toLowerCase()));
  const checkedIn = board.filter((w) => w.state === 'in' || w.state === 'left').length;
  const pick = (w) => { setSel(w.id); const p = byId[w.id]; if (p) m.current.flyTo([p.last.lat, p.last.lng], 17, { duration: 0.8 }); };

  return (
    <div className="live-grid">
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="search" style={{ maxWidth: 'none', marginBottom: 12 }}><Search size={16} /><input placeholder="Search employee" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <h3 style={{ marginBottom: 6 }}>Total check-in: {checkedIn}</h3>
        <div className="plist">
          {list.length === 0 ? <Empty text="No employees." /> : list.map((w) => (
            <div key={w.id} className={`pitem ${sel === w.id ? 'on' : ''}`} onClick={() => pick(w)}>
              <Avatar name={w.name} size={44} dot={DOT[w.status === 'late' && w.state === 'in' ? 'late' : w.state]} />
              <div className="who" style={{ flex: 1 }}><div><b>{w.name}</b><small>{w.department} · #{String(w.id).padStart(5, '0')}</small></div></div>
              <div style={{ textAlign: 'right' }}><Pill v={w.state} /><div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{w.first_in ? fmtTime(w.first_in) : ''}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginBottom: 0, padding: 14 }}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="muted" style={{ fontWeight: 600 }}>Pins show each person's last punch. Locations exist only at punch time, never in between.</span>
          <div className="row">
            <button className="icon-btn" onClick={() => { setDay(shiftDay(day, -1)); fitted.current = false; }}><ChevronLeft size={18} /></button>
            <input type="date" value={day} onChange={(e) => { setDay(e.target.value); fitted.current = false; }} />
            <button className="icon-btn" onClick={() => { setDay(shiftDay(day, 1)); fitted.current = false; }}><ChevronRight size={18} /></button>
            <button className="btn soft sm" onClick={() => { setDay(todayISO()); fitted.current = false; }}>Today</button>
          </div>
        </div>
        <div className="map" ref={el} />
        {sel && byId[sel] && <p className="muted" style={{ margin: '10px 0 0' }}>{byId[sel].name}: {byId[sel].points.length} punch(es) shown as a route. Click the pin again list item to refocus.</p>}
      </div>
    </div>
  );
}

function EmployeeLog({ api, token }) {
  const today = todayISO();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const query = `?from=${from}&to=${to}`;
  useEffect(() => { api.get(`/reports/attendance${query}`).then(setRows); }, [query]);
  const shown = rows.filter((r) => r.worker.toLowerCase().includes(q.toLowerCase()));
  const csv = async () => {
    const res = await fetch(`${BASE}/reports/attendance${query}&format=csv`, { headers: { authorization: `Bearer ${token}` } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `attendance_${from}_${to}.csv`; a.click();
  };
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row"><div className="search"><Search size={16} /><input placeholder="Search employee" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span className="muted">to</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn primary" onClick={csv}><Download size={16} />Export CSV</button>
      </div>
      {shown.length === 0 ? <Empty text="No attendance records in this range." /> : (
        <div className="tscroll"><table className="table">
          <thead><tr><th>Employee</th><th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th><th>Risk</th></tr></thead>
          <tbody>{shown.map((r, i) => (
            <tr key={i}><td><div className="who"><Avatar name={r.worker} size={34} /><b>{r.worker}</b></div></td><td>{r.day}</td><td>{fmtTime(r.check_in)}</td><td>{fmtTime(r.check_out)}</td>
              <td>{fmtHours(r.hours * 3600000)}</td><td><Pill v={r.status} /></td><td><Pill v={r.risk} /></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function DutyRoster({ api, toast, can }) {
  const [rows, setRows] = useState([]);
  const [sites, setSites] = useState([]);
  const w8 = can('workers.write');
  const load = () => { api.get('/workers').then(setRows); api.get('/sites').then(setSites); };
  useEffect(() => { load(); }, []);
  const patch = (id, b) => api.patch(`/workers/${id}`, b).then(() => { toast('Roster updated'); load(); });
  const site = (id) => sites.find((s) => s.id === id)?.name ?? 'Unassigned';
  return (
    <div className="card">
      <h3>Duty roster <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{w8 ? 'edit shift times inline' : 'read-only'}</span></h3>
      {rows.length === 0 ? <Empty text="No employees yet." /> : (
        <div className="tscroll"><table className="table">
          <thead><tr><th>Employee</th><th>Department</th><th>Site</th><th>Shift start</th><th>Shift end</th><th>Grace</th></tr></thead>
          <tbody>{rows.filter((w) => w.active).map((w) => (
            <tr key={w.id}><td><div className="who"><Avatar name={w.name} size={34} /><div><b>{w.name}</b><small>#{String(w.id).padStart(5, '0')}</small></div></div></td>
              <td>{w.department}</td><td>{site(w.site_id)}</td>
              <td><input type="time" disabled={!w8} value={w.shift_start} onChange={(e) => patch(w.id, { shift_start: e.target.value })} /></td>
              <td><input type="time" disabled={!w8} value={w.shift_end} onChange={(e) => patch(w.id, { shift_end: e.target.value })} /></td>
              <td>{w.grace_min} min</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function Attendance(props) {
  const [tab, setTab] = useState('live');
  const tabs = [['live', 'Live tracking', Radio], ['log', 'Employee log', ClipboardList], ['roster', 'Duty roster', CalendarRange]];
  return (
    <>
      <div className="tabs">{tabs.map(([k, label, Icon]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={16} />{label}</button>)}</div>
      {tab === 'live' && <LiveTracking {...props} />}
      {tab === 'log' && <EmployeeLog {...props} />}
      {tab === 'roster' && <DutyRoster {...props} />}
    </>
  );
}
