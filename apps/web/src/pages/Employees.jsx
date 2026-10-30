import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, KeyRound, Smartphone, Pencil, Power } from 'lucide-react';
import { Avatar, Empty, Modal, Pill, errText } from '../ui.jsx';

const blank = { name: '', email: '', password: '', department: 'General', site_id: '', shift_start: '09:00', shift_end: '18:00', grace_min: 10 };

function EmployeeForm({ initial, sites, depts, onSave, onClose, editing }) {
  const [f, setF] = useState({ ...blank, ...initial, site_id: initial?.site_id ?? '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name && (editing || (f.email && f.password));
  return (
    <Modal title={editing ? `Edit ${initial.name}` : 'Add employee'} onClose={onClose}>
      <div className="modal-b">
        <label className="f">Full name<input value={f.name} onChange={set('name')} placeholder="e.g. Ahmed Khan" /></label>
        {!editing && <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="f" style={{ flex: 1 }}>Email<input value={f.email} onChange={set('email')} placeholder="ahmed@company.com" /></label>
          <label className="f" style={{ flex: 1 }}>Password<input value={f.password} onChange={set('password')} placeholder="Min. 6 characters" /></label>
        </div>}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="f" style={{ flex: 1 }}>Department<input list="depts" value={f.department} onChange={set('department')} /><datalist id="depts">{depts.map((d) => <option key={d} value={d} />)}</datalist></label>
          <label className="f" style={{ flex: 1 }}>Work location
            <select value={f.site_id} onChange={set('site_id')}><option value="">Unassigned</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="f" style={{ flex: 1 }}>Shift start<input type="time" value={f.shift_start} onChange={set('shift_start')} /></label>
          <label className="f" style={{ flex: 1 }}>Shift end<input type="time" value={f.shift_end} onChange={set('shift_end')} /></label>
          <label className="f" style={{ flex: 1 }}>Grace (min)<input type="number" min="0" value={f.grace_min} onChange={set('grace_min')} /></label>
        </div>
        <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn soft" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!ok} onClick={() => onSave({ ...f, site_id: f.site_id ? Number(f.site_id) : null, grace_min: Number(f.grace_min) })}>{editing ? 'Save changes' : 'Add employee'}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function Employees({ api, toast, can, params, go }) {
  const [rows, setRows] = useState([]);
  const [sites, setSites] = useState([]);
  const [q, setQ] = useState(params?.q ?? '');
  const [dept, setDept] = useState('all');
  const [form, setForm] = useState(params?.add ? { mode: 'add' } : null);
  const [cred, setCred] = useState(null);
  const w8 = can('workers.write');
  const load = () => { api.get('/workers').then(setRows); api.get('/sites').then(setSites); };
  useEffect(() => { load(); }, []);
  const depts = useMemo(() => [...new Set(rows.map((r) => r.department))], [rows]);
  const siteName = (id) => sites.find((s) => s.id === id)?.name ?? 'Unassigned';
  const shown = rows.filter((r) => (dept === 'all' || r.department === dept) && (r.name + r.email + r.id).toLowerCase().includes(q.toLowerCase()));

  const save = async (f) => {
    try {
      if (form.mode === 'add') {
        const r = await api.post('/workers', f);
        setCred({ name: f.name, id: r.id, pin: r.pin, email: f.email, password: f.password });
        toast('Employee added');
      } else {
        await api.patch(`/workers/${form.row.id}`, { name: f.name, department: f.department, site_id: f.site_id, shift_start: f.shift_start, shift_end: f.shift_end, grace_min: f.grace_min });
        toast('Changes saved');
      }
      setForm(null); load();
    } catch (x) { toast(errText(x)); }
  };
  const resetPin = async (w) => { const r = await api.post(`/workers/${w.id}/pin`); setCred({ name: w.name, id: w.id, pin: r.pin }); };
  const toggle = (w) => api.post(`/workers/${w.id}/active`, { active: !w.active }).then(() => { toast(w.active ? 'Employee disabled' : 'Employee enabled'); load(); });

  return (
    <>
      <div className="page-head">
        <div><h1>Employees</h1><p>{rows.filter((r) => r.active).length} active · {rows.length} total</p></div>
        {w8 && <button className="btn primary" onClick={() => setForm({ mode: 'add' })}><Plus size={17} />Add employee</button>}
      </div>

      {cred && (
        <div className="credit">
          <div className="row between"><b>Login details for {cred.name}</b><button className="btn soft sm" onClick={() => setCred(null)}>Done</button></div>
          <div className="row" style={{ marginTop: 10, gap: 28 }}>
            {cred.email && <div><div className="muted">App login</div><b>{cred.email}</b> / <b>{cred.password}</b></div>}
            <div><div className="muted">Kiosk code</div><b style={{ fontSize: 20 }}>{cred.id}</b></div>
            <div><div className="muted">Kiosk PIN (shown once)</div><span className="pin-n">{cred.pin}</span></div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="row">
            <div className="search"><Search size={16} /><input placeholder="Search by name, email or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select value={dept} onChange={(e) => setDept(e.target.value)}><option value="all">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
        </div>
        {shown.length === 0 ? <Empty text="No employees found." /> : (
          <div className="tscroll"><table className="table">
            <thead><tr><th>Employee</th><th>Department</th><th>Work location</th><th>Shift</th><th>Device</th><th>Status</th><th /></tr></thead>
            <tbody>{shown.map((w) => (
              <tr key={w.id} style={{ opacity: w.active ? 1 : 0.55 }}>
                <td><div className="who"><Avatar name={w.name} size={42} /><div><b>{w.name}</b><small>{w.email} · #{String(w.id).padStart(5, '0')}</small></div></div></td>
                <td>{w.department}</td><td>{siteName(w.site_id)}</td><td>{w.shift_start} - {w.shift_end}<div className="muted" style={{ fontSize: 11.5 }}>grace {w.grace_min}m</div></td>
                <td>{w.device_id ? <Pill v="verified" text="Bound" /> : <span className="muted">Not bound</span>}</td>
                <td><Pill v={w.active ? 'active' : 'disabled'} /></td>
                <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                  {w8 && <button className="btn soft sm" title="Edit" onClick={() => setForm({ mode: 'edit', row: w })}><Pencil size={14} /></button>}
                  {w8 && <button className="btn soft sm" title="New kiosk PIN" onClick={() => resetPin(w)}><KeyRound size={14} /></button>}
                  {w8 && <button className="btn soft sm" style={{ visibility: w.device_id ? 'visible' : 'hidden' }} title="Reset bound device" onClick={() => api.patch(`/workers/${w.id}`, { reset_device: true }).then(() => { toast('Device reset'); load(); })}><Smartphone size={14} /></button>}
                  {w8 && <button className={`btn sm ${w.active ? 'danger' : 'soft'}`} title={w.active ? 'Disable' : 'Enable'} onClick={() => toggle(w)}><Power size={14} /></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {form && <EmployeeForm editing={form.mode === 'edit'} initial={form.row} sites={sites} depts={depts} onSave={save} onClose={() => setForm(null)} />}
    </>
  );
}
