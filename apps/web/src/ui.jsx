import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Inbox } from 'lucide-react';

export const ERR = {
  email_taken: 'That email is already used.', bad_credentials: 'Wrong email or password.', admin_only: 'Workers use the mobile app. This sign-in is for staff.',
  account_disabled: 'This account is disabled.', forbidden: 'Your role is not allowed to do that.', radius_min_50: 'Radius must be at least 50 m.',
  missing_fields: 'Please fill in all fields.', supervisor_needs_site: 'A supervisor must be assigned to a site.',
};
export const errText = (e) => ERR[e.message] ?? e.message;

export const usePoll = (fn, ms) => {
  useEffect(() => { fn(); if (!ms) return; const t = setInterval(fn, ms); return () => clearInterval(t); }, []);
};

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--');
export const fmtHours = (ms = 0) => `${Math.floor(ms / 3600000)}h ${String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')}m`;
export const todayISO = () => new Date().toISOString().slice(0, 10);

const COLORS = ['#4f46e5', '#12b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#6366f1', '#14b8a6', '#f97316'];
export const colorFor = (s = '') => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
export const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';

export function Avatar({ name, size = 40, dot }) {
  return (
    <span className="av" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${colorFor(name)}, ${colorFor(name + 'x')})` }}>
      {initials(name)}
      {dot && <i style={{ background: dot }} />}
    </span>
  );
}

const PILL = {
  present: 'ok', in: 'ok', approved: 'ok', low: 'ok', active: 'ok', verified: 'ok',
  late: 'warn', medium: 'warn', pending: 'warn', submitted: 'warn', expected: 'grey',
  absent: 'bad', high: 'bad', rejected: 'bad', disabled: 'bad',
  left: 'info', leave: 'violet', kiosk: 'info', open: 'grey', off: 'grey',
};
export function Pill({ v, text }) {
  if (!v) return null;
  return <span className={`pill p-${PILL[v] ?? 'grey'}`}>{text ?? v}</span>;
}

export function Empty({ text = 'Nothing here yet.' }) {
  return <div className="empty"><Inbox size={34} /><div>{text}</div></div>;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [onClose]);
  // Portal to <body>: the page container is animated and would otherwise clip a fixed overlay.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-h"><h3 style={{ fontSize: 18 }}>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Toast({ text }) { return text ? <div className="toast">{text}</div> : null; }

/** Donut with animated segments. parts: [{label, value, color}] drawn as share of `total`. */
export function Donut({ parts, total, center, sub }) {
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 50); return () => clearTimeout(t); }, []);
  return (
    <div className="donut">
      <svg viewBox="0 0 180 180" width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="90" cy="90" r={R} fill="none" stroke="var(--line)" strokeWidth="20" />
        {total > 0 && parts.map((p) => {
          const len = (p.value / total) * C;
          const el = <circle key={p.label} cx="90" cy="90" r={R} fill="none" stroke={p.color} strokeWidth="20" strokeLinecap="butt"
            strokeDasharray={`${ready ? Math.max(0, len - 2) : 0} ${C}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="center"><div><b>{center}</b><span>{sub}</span></div></div>
    </div>
  );
}

/** Stacked daily bars (present/late/absent) with axis, grid and hover tooltip. */
export function TrendChart({ data }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const W = 760, H = 250, L = 38, B = 38, T = 10;
  const max = Math.max(5, ...data.map((d) => d.present + d.late + d.absent));
  const top = Math.ceil(max / 5) * 5;
  const bw = Math.min(26, ((W - L) / Math.max(1, data.length)) * 0.62);
  const step = (W - L) / Math.max(1, data.length);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="bars" role="img" aria-label="Attendance trend">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (top / 4) * i;
          return <g key={i}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--mute)">{Math.round(v)}</text></g>;
        })}
        {data.map((d, i) => {
          const x = L + i * step + (step - bw) / 2;
          let acc = 0;
          const seg = (v, c, k) => { const h = (H - T - B) * (v / top); const r = <rect key={k} x={x} y={y(0) - acc - h} width={bw} height={Math.max(0, h)} fill={c} rx="3" opacity={hover != null && hover !== i ? 0.45 : 1} />; acc += h; return r; };
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + i * step} y={T} width={step} height={H - T - B} fill="transparent" />
              {seg(d.present, 'var(--ok)', 'p')}{seg(d.late, 'var(--warn)', 'l')}{seg(d.absent, 'var(--bad)', 'a')}
              {(data.length <= 16 || i % 2 === 0) && <text x={x + bw / 2} y={H - 14} textAnchor="middle" fontSize="11" fill="var(--mute)">{d.day.slice(8)}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${((L + hover * step + step / 2) / W) * 100}%`, top: 40 }}>
          <div>{data[hover].day}</div>
          <div style={{ color: '#6ee7b7' }}>Present {data[hover].present}</div>
          <div style={{ color: '#fcd34d' }}>Late {data[hover].late}</div>
          <div style={{ color: '#fca5a5' }}>Absent {data[hover].absent}</div>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
        {[['Present', 'var(--ok)'], ['Late', 'var(--warn)'], ['Absent', 'var(--bad)']].map(([l, c]) => (
          <span key={l} className="muted" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />{l}</span>
        ))}
      </div>
    </div>
  );
}

export class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="card" style={{ textAlign: 'center' }}><h3 style={{ justifyContent: 'center' }}>Something went wrong on this page</h3><p className="muted">{String(this.state.err.message ?? this.state.err)}</p><button className="btn primary" onClick={() => this.setState({ err: null })}>Try again</button></div>;
  }
}

export function StatCard({ icon: Icon, label, value, tone = 'primary', onClick }) {
  const tones = { primary: ['var(--primary-soft)', 'var(--primary)'], ok: ['var(--ok-soft)', 'var(--ok)'], warn: ['var(--warn-soft)', 'var(--warn)'], bad: ['var(--bad-soft)', 'var(--bad)'], violet: ['var(--violet-soft)', 'var(--violet)'], info: ['var(--info-soft)', 'var(--info)'] };
  const [bg, fg] = tones[tone];
  return (
    <div className="stat" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="ico" style={{ background: bg, color: fg }}><Icon size={22} /></div>
      <div><div className="n">{value}</div><div className="l">{label}</div></div>
    </div>
  );
}
