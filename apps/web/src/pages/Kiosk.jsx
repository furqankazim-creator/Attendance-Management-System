import React, { useEffect, useState } from 'react';
import { MapPinCheck, Delete, CheckCircle2, XCircle } from 'lucide-react';
import { BASE } from '../api.js';

const KMSG = { bad_id_or_pin: 'Wrong code or PIN.', wrong_site: 'You are not assigned to this site.', too_many_attempts: 'Too many tries. Wait 5 minutes.', invalid_kiosk: 'This kiosk is not set up.' };

export default function Kiosk() {
  const token = new URLSearchParams(location.hash.split('?')[1] ?? '').get('token') ?? '';
  const [info, setInfo] = useState(undefined);
  const [now, setNow] = useState(new Date());
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [field, setField] = useState('id');
  const [result, setResult] = useState(null);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    fetch(`${BASE}/kiosk/info`, { headers: { 'x-kiosk-token': token } }).then((r) => (r.ok ? r.json() : null)).then(setInfo).catch(() => setInfo(null));
  }, [token]);
  const press = (d) => (field === 'id' ? setId((v) => (v + d).slice(0, 8)) : setPin((v) => (v + d).slice(0, 6)));
  const back = () => (field === 'id' ? setId((v) => v.slice(0, -1)) : setPin((v) => v.slice(0, -1)));
  const submit = async () => {
    try {
      const res = await fetch(`${BASE}/kiosk/punch`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kiosk-token': token }, body: JSON.stringify({ worker_id: Number(id), pin }) });
      const d = await res.json();
      setResult(res.ok ? { ok: true, title: `Checked ${d.kind}`, text: `${d.name}${d.status ? ` · ${d.status}` : ''}` } : { ok: false, title: 'Not recorded', text: KMSG[d.error] ?? d.error });
    } catch { setResult({ ok: false, title: 'Not recorded', text: 'No connection to the server.' }); }
    setId(''); setPin(''); setField('id');
    setTimeout(() => setResult(null), 4000);
  };
  if (info === undefined) return <div className="auth"><div className="formside" style={{ gridColumn: '1/-1' }}>Loading...</div></div>;
  if (!token || info === null) return <div className="auth"><div className="formside" style={{ gridColumn: '1/-1' }}><div className="card"><h3>Kiosk</h3><p>{!token ? 'Missing kiosk token in the link.' : 'This kiosk link is not valid.'}</p></div></div></div>;
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'linear-gradient(160deg,#15133f,#3730a3 60%,#14b8a6)', color: '#fff', textAlign: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="brand" style={{ justifyContent: 'center' }}><div className="logo"><MapPinCheck size={20} color="#fff" /></div>GeoWork kiosk</div>
        <div style={{ opacity: 0.8, fontWeight: 600 }}>{info.site} · {info.name}</div>
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-.03em', margin: '6px 0 14px' }}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        {result ? (
          <div className="card" style={{ background: result.ok ? 'var(--ok)' : 'var(--bad)', color: '#fff', border: 0, padding: 30 }}>
            {result.ok ? <CheckCircle2 size={54} /> : <XCircle size={54} />}
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{result.title}</div><div style={{ fontSize: 18, opacity: 0.95 }}>{result.text}</div>
          </div>
        ) : (
          <div className="card" style={{ color: 'var(--ink)' }}>
            <div className="row" style={{ justifyContent: 'center' }}>
              <input readOnly placeholder="Worker code" value={id} onClick={() => setField('id')} style={{ width: 150, textAlign: 'center', fontSize: 20, borderColor: field === 'id' ? 'var(--primary)' : undefined }} />
              <input readOnly placeholder="PIN" type="password" value={pin} onClick={() => setField('pin')} style={{ width: 120, textAlign: 'center', fontSize: 20, borderColor: field === 'pin' ? 'var(--primary)' : undefined }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 14 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} className="btn soft" style={{ fontSize: 24, padding: 16, justifyContent: 'center' }} onClick={() => press(d)}>{d}</button>)}
              <button className="btn soft" style={{ justifyContent: 'center' }} onClick={back}><Delete size={22} /></button>
              <button className="btn soft" style={{ fontSize: 24, padding: 16, justifyContent: 'center' }} onClick={() => press('0')}>0</button>
              <button className="btn primary" style={{ justifyContent: 'center', fontSize: 16 }} disabled={field === 'id' ? !id : pin.length < 4} onClick={() => (field === 'id' ? setField('pin') : submit())}>{field === 'id' ? 'Next' : 'Punch'}</button>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>Enter your code, tap Next, enter your PIN, tap Punch. The first punch checks you in, the next checks you out.</p>
          </div>
        )}
      </div>
    </div>
  );
}
