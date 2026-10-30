import React, { useState } from 'react';
import { MapPinCheck, ShieldCheck, WifiOff, Sparkles, Eye, EyeOff } from 'lucide-react';
import { makeApi } from '../api.js';
import { errText } from '../ui.jsx';

export default function Login({ onToken }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ orgName: '', name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const api = makeApi();
      const r = mode === 'login'
        ? await api.post('/auth/login', { email: f.email, password: f.password })
        : await api.post('/auth/register-org', { ...f, tz_offset_min: -new Date().getTimezoneOffset() });
      if (r.user && r.user.role === 'worker') throw new Error('admin_only');
      onToken(r.token);
    } catch (x) { setErr(x.message === 'Failed to fetch' ? 'Cannot reach the server.' : errText(x)); }
    setBusy(false);
  };
  return (
    <div className="auth">
      <div className="art">
        <div className="brand"><div className="logo"><MapPinCheck size={20} color="#fff" /></div>GeoWork</div>
        <div>
          <h1>Attendance that knows<br />where your team is.</h1>
          <ul>
            <li><span><MapPinCheck size={18} /></span>Geofenced check-in verified on the server</li>
            <li><span><ShieldCheck size={18} /></span>Risk scoring and fraud flags on every punch</li>
            <li><span><WifiOff size={18} /></span>Offline punches that sync when back online</li>
            <li><span><Sparkles size={18} /></span>Live map, timesheets and approvals in one place</li>
          </ul>
        </div>
        <small style={{ opacity: 0.7, position: 'relative' }}>Location is read only when employees punch, never in between.</small>
      </div>
      <div className="formside">
        <form onSubmit={submit}>
          <h1 style={{ fontSize: 28 }}>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1>
          <p className="muted" style={{ margin: '6px 0 18px' }}>{mode === 'login' ? 'Sign in to the staff dashboard.' : 'You will be the Owner of this organisation.'}</p>
          {mode === 'register' && <>
            <label className="f">Organisation<input value={f.orgName} onChange={set('orgName')} placeholder="Acme Industries" /></label>
            <label className="f">Your name<input value={f.name} onChange={set('name')} placeholder="Full name" /></label>
          </>}
          <label className="f">Email<input value={f.email} onChange={set('email')} placeholder="you@company.com" autoComplete="username" /></label>
          <label className="f">Password
            <div style={{ position: 'relative' }}>
              <input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} autoComplete="current-password" />
              <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4, width: 34, height: 34, border: 0 }} onClick={() => setShow(!show)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          <p className="err" style={{ minHeight: 20 }}>{err}</p>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 13 }} disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create workspace'}</button>
          <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
            {mode === 'login' ? 'New organisation? ' : 'Already have an account? '}
            <a href="#/" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>{mode === 'login' ? 'Create workspace' : 'Sign in'}</a>
          </p>
        </form>
      </div>
    </div>
  );
}
