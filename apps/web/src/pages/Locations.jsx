import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Plus, MapPin, Search, Pencil, Trash2, Tablet, Copy, ExternalLink, ShieldAlert } from 'lucide-react';
import { Empty, Modal, errText, usePoll } from '../ui.jsx';
import { BASE } from '../api.js';

const PRESETS = [50, 100, 150, 200, 300];

function LocationModal({ initial, onClose, onSave }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(initial?.radius_m ?? 150);
  const [auto, setAuto] = useState(initial ? initial.auto_attendance !== 0 : true);
  const [mode, setMode] = useState(initial?.type ?? 'circle');
  const [center, setCenter] = useState(initial?.type === 'circle' ? { lat: initial.lat, lng: initial.lng } : null);
  const [poly, setPoly] = useState([]);
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const el = useRef(null), map = useRef(null), shape = useRef(null), pin = useRef(null), modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const start = center ?? { lat: 24.8607, lng: 67.0011 };
    map.current = L.map(el.current).setView([start.lat, start.lng], center ? 16 : 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map.current);
    map.current.on('click', (e) => {
      if (modeRef.current === 'circle') setCenter({ lat: e.latlng.lat, lng: e.latlng.lng });
      else setPoly((a) => [...a, [e.latlng.lat, e.latlng.lng]]);
    });
    if (!center && 'geolocation' in navigator) navigator.geolocation.getCurrentPosition((g) => map.current.setView([g.coords.latitude, g.coords.longitude], 16), () => {});
    setTimeout(() => map.current.invalidateSize(), 120);
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    shape.current?.remove(); pin.current?.remove(); shape.current = pin.current = null;
    const style = { color: '#4f46e5', weight: 2, fillColor: '#4f46e5', fillOpacity: 0.18 };
    if (mode === 'circle' && center) {
      shape.current = L.circle([center.lat, center.lng], { ...style, radius: Number(radius) || 50 }).addTo(map.current);
      pin.current = L.marker([center.lat, center.lng], { draggable: true }).addTo(map.current)
        .on('dragend', (e) => setCenter({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng }));
    }
    if (mode === 'polygon' && poly.length) shape.current = (poly.length > 2 ? L.polygon(poly, style) : L.polyline(poly, style)).addTo(map.current);
  }, [center, radius, poly, mode]);

  const search = async () => {
    if (!address.trim()) return;
    setBusy(true);
    try {
      // Nominatim (OpenStreetMap) geocoder: fine for a prototype, replace with a paid geocoder in production.
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(address)}`);
      setHits(await r.json());
    } catch { setHits([]); }
    setBusy(false);
  };
  const choose = (h) => {
    const p = { lat: Number(h.lat), lng: Number(h.lon) };
    setHits([]); setAddress(h.display_name); setMode('circle'); setCenter(p); map.current.flyTo([p.lat, p.lng], 17);
  };
  const ready = name && (mode === 'circle' ? center && Number(radius) >= 50 : poly.length >= 3);
  const submit = () => onSave(mode === 'circle'
    ? { name, type: 'circle', lat: center.lat, lng: center.lng, radius_m: Number(radius), auto_attendance: auto }
    : { name, type: 'polygon', points: poly, auto_attendance: auto });

  return (
    <Modal title={editing ? 'Edit location' : 'Add work location'} onClose={onClose} wide>
      <div className="split">
        <div className="l">
          <label className="f">Location name *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Karachi Head Office" /></label>
          {!editing && <>
            <label className="f">Boundary type</label>
            <div className="seg"><button className={mode === 'circle' ? 'on' : ''} onClick={() => { setMode('circle'); setPoly([]); }}>Circle</button>
              <button className={mode === 'polygon' ? 'on' : ''} onClick={() => { setMode('polygon'); setCenter(null); }}>Polygon</button></div>
          </>}
          <label className="f">Address or place</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input style={{ flex: 1 }} value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search an address" />
            <button className="btn soft" onClick={search} disabled={busy}><Search size={16} /></button>
          </div>
          {hits.length > 0 && <div style={{ border: '1px solid var(--line)', borderRadius: 12, marginTop: 6, overflow: 'hidden' }}>
            {hits.map((h) => <div key={h.place_id} className="pitem" style={{ borderRadius: 0, fontSize: 12.5 }} onClick={() => choose(h)}><MapPin size={14} />{h.display_name}</div>)}</div>}
          {mode === 'circle' && <>
            <label className="f">Location radius *</label>
            <div className="chipset">{PRESETS.map((p) => <button key={p} className={Number(radius) === p ? 'on' : ''} onClick={() => setRadius(p)}>{p} m</button>)}</div>
            <label className="f">Custom radius (min 50 m)<input type="number" min="50" value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
          </>}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 500 }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
            <span><b style={{ fontWeight: 700 }}>Automatic attendance</b><br /><span className="muted">Employees who turn it on in the app are checked in when they enter this area and out when they leave. For reliable detection use a radius of 100 m or more.</span></span>
          </label>
          <p className="muted" style={{ marginTop: 12 }}>{mode === 'circle' ? 'Click the map or drag the pin to set the centre.' : `Click the map to add corners (${poly.length} so far, need 3+).`}</p>
          {mode === 'polygon' && poly.length > 0 && <button className="btn soft sm" onClick={() => setPoly(poly.slice(0, -1))}>Undo last corner</button>}
          <div className="row" style={{ marginTop: 22 }}>
            <button className="btn soft" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
            <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!ready} onClick={submit}>{editing ? 'Save location' : 'Add location'}</button>
          </div>
        </div>
        <div className="r"><div className="map" ref={el} /></div>
      </div>
    </Modal>
  );
}

function Kiosks({ api, toast, sites }) {
  const [list, setList] = useState([]);
  const [f, setF] = useState({ name: '', site_id: '' });
  const load = () => api.get('/kiosks').then(setList);
  usePoll(load, 20000);
  const link = (k) => `${location.origin}${location.pathname}#/kiosk?token=${k.token}`;
  const add = async () => { try { await api.post('/kiosks', { name: f.name, site_id: Number(f.site_id) }); setF({ name: '', site_id: '' }); toast('Kiosk created'); load(); } catch (x) { toast(errText(x)); } };
  return (
    <div className="card">
      <h3><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Tablet size={18} />Kiosks</span></h3>
      <p className="muted" style={{ marginTop: -6 }}>Open the link on a shared tablet at the entrance. Workers punch with their code and PIN. Keep the link on that tablet only.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Kiosk name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select value={f.site_id} onChange={(e) => setF({ ...f, site_id: e.target.value })}><option value="">Site...</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn primary" disabled={!f.name || !f.site_id} onClick={add}><Plus size={16} />Create kiosk</button>
      </div>
      {list.length === 0 ? <Empty text="No kiosks yet." /> : list.map((k) => (
        <div key={k.id} className="site-card" style={{ marginBottom: 10 }}>
          <div className="ico"><Tablet size={20} /></div>
          <div style={{ flex: 1 }}><b>{k.name}</b><div className="muted">{k.site}</div></div>
          <a className="btn soft sm" href={link(k)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open</a>
          <button className="btn soft sm" onClick={() => { navigator.clipboard?.writeText(link(k)); toast('Kiosk link copied'); }}><Copy size={14} />Copy link</button>
          <button className="btn danger sm" onClick={() => api.del(`/kiosks/${k.id}`).then(() => { toast('Kiosk removed'); load(); })}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}

const DUTY = { auto_close: 1, auto_close_after_min: 60, away_alert_min: 20 };

function DutyModal({ site, onClose, onSave }) {
  const cur = { ...DUTY, ...Object.fromEntries(Object.entries(site).filter(([k, v]) => k in DUTY && v != null)) };
  const [close, setClose] = useState(!!cur.auto_close);
  const [after, setAfter] = useState(cur.auto_close_after_min);
  const [away, setAway] = useState(cur.away_alert_min);
  const ok = Number.isInteger(Number(after)) && after !== '' && Number(after) >= 0 && Number(after) <= 480 && Number.isInteger(Number(away)) && away !== '' && Number(away) >= 5 && Number(away) <= 240;
  return (
    <Modal title={`Duty rules - ${site.name}`} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 14 }}>What the system does when employees at this location leave the work area or forget to check out.</p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 500 }}>
        <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
        <span><b style={{ fontWeight: 700 }}>Close the day automatically</b><br /><span className="muted">If someone is still checked in after their shift ends, check them out at shift end and notify you and the employee.</span></span>
      </label>
      <label className="f">Wait this many minutes after shift end first (0 - 480)
        <input type="number" min="0" max="480" value={after} disabled={!close} onChange={(e) => setAfter(e.target.value)} />
      </label>
      <label className="f">Alert me when an employee has been outside the area for (minutes, 5 - 240)
        <input type="number" min="5" max="240" value={away} onChange={(e) => setAway(e.target.value)} />
      </label>
      <p className="muted" style={{ marginTop: 10 }}>The away alert applies to employees who left the area during their shift: automatic exits and check-outs made from outside the area.</p>
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn soft" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
        <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!ok} onClick={() => onSave({ auto_close: close, auto_close_after_min: Number(after), away_alert_min: Number(away) })}>Save rules</button>
      </div>
    </Modal>
  );
}

export default function Locations({ api, toast, params }) {
  const [sites, setSites] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [modal, setModal] = useState(params?.add ? { mode: 'add' } : null);
  const [duty, setDuty] = useState(null);
  const load = () => { api.get('/sites').then(setSites); api.get('/workers').then(setWorkers).catch(() => {}); };
  usePoll(load, 15000);
  const save = async (body) => {
    try {
      if (modal.mode === 'edit') await api.patch(`/sites/${modal.site.id}`, { name: body.name, radius_m: body.radius_m, lat: body.lat, lng: body.lng, auto_attendance: body.auto_attendance });
      else await api.post('/sites', body);
      toast('Location saved'); setModal(null); load();
    } catch (x) { toast(errText(x)); }
  };
  const saveDuty = async (body) => {
    try { await api.patch(`/sites/${duty.id}`, body); toast('Duty rules saved'); setDuty(null); load(); } catch (x) { toast(errText(x)); }
  };
  const remove = async (s) => { if (!confirm(`Delete "${s.name}"? Employees on it will be unassigned.`)) return; await api.del(`/sites/${s.id}`); toast('Location deleted'); load(); };
  return (
    <>
      <div className="page-head">
        <div><h1>Work locations</h1><p>Geofenced boundaries where attendance is verified.</p></div>
        <button className="btn primary" onClick={() => setModal({ mode: 'add' })}><Plus size={17} />Add location</button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', marginBottom: 18 }}>
        {sites.length === 0 && <div className="card"><Empty text="No locations yet. Add your first work location." /></div>}
        {sites.map((s) => (
          <div key={s.id} className="site-card" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
            <div className="ico"><MapPin size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><b>{s.name}</b>
              <div className="muted">{s.type === 'circle' ? `${s.radius_m} m radius` : `${s.points.length}-corner polygon`} · {workers.filter((w) => w.site_id === s.id).length} employees · auto attendance {s.auto_attendance === 0 ? 'off' : 'on'}</div>
              <div className="muted">{s.auto_close === 0 ? 'Auto close off' : `Auto close ${s.auto_close_after_min ?? 60} min after shift`} · away alert {s.away_alert_min ?? 20} min</div></div>
            <button className="btn soft sm" title="Duty rules" onClick={() => setDuty(s)}><ShieldAlert size={14} /></button>
            {s.type === 'circle' && <button className="btn soft sm" onClick={() => setModal({ mode: 'edit', site: s })}><Pencil size={14} /></button>}
            <button className="btn danger sm" onClick={() => remove(s)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <Kiosks api={api} toast={toast} sites={sites} />
      {duty && <DutyModal site={duty} onClose={() => setDuty(null)} onSave={saveDuty} />}
      {modal && <LocationModal initial={modal.site} onClose={() => setModal(null)} onSave={save} />}
    </>
  );
}
