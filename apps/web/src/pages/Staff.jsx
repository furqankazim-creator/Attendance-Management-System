import React, { useEffect, useState } from 'react';
import { Plus, Crown, UserCog, Shield, Eye, HardHat } from 'lucide-react';
import { Avatar, Empty, Modal, Pill, errText } from '../ui.jsx';

const ROLE_INFO = {
  owner: ['Owner', 'Full control, including staff accounts.', Crown, '#f59e0b'],
  hr: ['HR', 'Sites, employees, approvals, reports and audit log.', UserCog, '#4f46e5'],
  supervisor: ['Site supervisor', 'Only the employees at one site: board, approvals, reports.', Shield, '#12b981'],
  auditor: ['Auditor', 'Read-only access to everything, including the audit log.', Eye, '#8b5cf6'],
  worker: ['Employee', 'Mobile app only: punches, history, requests.', HardHat, '#64748b'],
};

export default function Staff({ api, toast }) {
  const [staff, setStaff] = useState([]);
  const [sites, setSites] = useState([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'hr', site_id: '' });
  const load = () => { api.get('/staff').then(setStaff); api.get('/sites').then(setSites); };
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const add = async () => {
    try { await api.post('/staff', { ...f, site_id: f.site_id ? Number(f.site_id) : null }); setOpen(false); setF({ name: '', email: '', password: '', role: 'hr', site_id: '' }); toast('Staff account created'); load(); }
    catch (x) { toast(errText(x)); }
  };
  const patch = (id, body) => api.patch(`/staff/${id}`, body).then(() => { toast('Saved'); load(); }).catch((x) => toast(errText(x)));
  return (
    <>
      <div className="page-head"><div><h1>Staff &amp; roles</h1><p>Control who can see and change what.</p></div>
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} />Add staff</button></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', marginBottom: 18 }}>
        {Object.entries(ROLE_INFO).map(([k, [label, about, Icon, color]]) => (
          <div key={k} className="stat" style={{ alignItems: 'flex-start' }}>
            <div className="ico" style={{ background: color + '22', color }}><Icon size={22} /></div>
            <div><b>{label}</b><div className="muted" style={{ fontSize: 12.5 }}>{about}</div></div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Team accounts</h3>
        {staff.length === 0 ? <Empty /> : (
          <div className="tscroll"><table className="table"><thead><tr><th>Member</th><th>Role</th><th>Site</th><th>Status</th><th /></tr></thead>
            <tbody>{staff.map((u) => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                <td><div className="who"><Avatar name={u.name} size={38} /><div><b>{u.name}</b><small>{u.email}</small></div></div></td>
                <td>{u.role === 'owner' ? <Pill v="verified" text="Owner" /> : <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                  <option value="hr">HR</option><option value="supervisor">Site supervisor</option><option value="auditor">Auditor</option></select>}</td>
                <td>{u.role === 'supervisor' ? <select value={u.site_id ?? ''} onChange={(e) => patch(u.id, { site_id: Number(e.target.value) })}><option value="">Site...</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <span className="muted">All sites</span>}</td>
                <td><Pill v={u.active ? 'active' : 'disabled'} /></td>
                <td>{u.role !== 'owner' && <button className={`btn sm ${u.active ? 'danger' : 'soft'}`} onClick={() => patch(u.id, { active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</button>}</td>
              </tr>))}</tbody></table></div>
        )}
      </div>
      {open && (
        <Modal title="Add staff account" onClose={() => setOpen(false)}>
          <div className="modal-b">
            <label className="f">Name<input value={f.name} onChange={set('name')} /></label>
            <label className="f">Email<input value={f.email} onChange={set('email')} /></label>
            <label className="f">Password<input value={f.password} onChange={set('password')} /></label>
            <label className="f">Role<select value={f.role} onChange={set('role')}><option value="hr">HR</option><option value="supervisor">Site supervisor</option><option value="auditor">Auditor (read-only)</option></select></label>
            {f.role === 'supervisor' && <label className="f">Site<select value={f.site_id} onChange={set('site_id')}><option value="">Select...</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
            <p className="muted">{ROLE_INFO[f.role][1]}</p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn soft" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" disabled={!f.name || !f.email || !f.password || (f.role === 'supervisor' && !f.site_id)} onClick={add}>Create account</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
