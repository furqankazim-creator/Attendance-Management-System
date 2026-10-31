import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, BarChart3, Users, MapPinned, CalendarCheck, Timer, Building2, ShieldCheck, ScrollText,
  Search, Bell, Sun, Moon, LogOut, MapPinCheck,
} from 'lucide-react';
import { makeApi } from './api.js';
import { Avatar, Boundary, Toast } from './ui.jsx';
import Login from './pages/Login.jsx';
import Kiosk from './pages/Kiosk.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Attendance from './pages/Attendance.jsx';
import Employees from './pages/Employees.jsx';
import Locations from './pages/Locations.jsx';
import { Approvals, Timesheets } from './pages/Approvals.jsx';
import { Reports, Audit } from './pages/Reports.jsx';
import Staff from './pages/Staff.jsx';

// [route, label, icon, permission, component, sidebar group]
const PAGES = [
  ['dashboard', 'Dashboard', LayoutDashboard, 'board.read', Dashboard, ''],
  ['reports', 'Reports', BarChart3, 'reports.read', Reports, ''],
  ['employees', 'Employees', Users, 'workers.read', Employees, 'HR management'],
  ['attendance', 'Attendance', MapPinned, 'board.read', Attendance, 'HR management'],
  ['approvals', 'Approvals', CalendarCheck, 'approve.read', Approvals, 'HR management'],
  ['timesheets', 'Timesheets', Timer, 'approve.read', Timesheets, 'HR management'],
  ['locations', 'Locations', Building2, 'sites.write', Locations, 'Facilities'],
  ['staff', 'Staff & roles', ShieldCheck, 'staff.manage', Staff, 'Administration'],
  ['audit', 'Audit log', ScrollText, 'audit.read', Audit, 'Administration'],
];
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const routeOf = () => (location.hash.match(/^#\/([a-z]+)/) ?? [])[1];

function AdminApp() {
  const [token, setToken] = useState(() => get('token'));
  const [me, setMe] = useState(null);
  const [route, setRoute] = useState(routeOf() ?? 'dashboard');
  const [params, setParams] = useState({});
  const [theme, setTheme] = useState(() => get('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const [synced, setSynced] = useState(null);
  useEffect(() => { const f = () => setSynced(new Date()); addEventListener('geowork:synced', f); return () => removeEventListener('geowork:synced', f); }, []);
  const [search, setSearch] = useState('');
  const api = useMemo(() => makeApi(token), [token]);

  useEffect(() => { document.documentElement.dataset.theme = theme; put('theme', theme); }, [theme]);
  const toast = useCallback((t) => { setMsg(t); setTimeout(() => setMsg(''), 2600); }, []);
  const signIn = (t) => { put('token', t); setToken(t); if (!t) { setMe(null); location.hash = '#/'; } };
  const go = useCallback((r, p = {}) => { setParams(p); setRoute(r); location.hash = `#/${r}`; }, []);
  useEffect(() => { const f = () => { const r = routeOf(); if (r && r !== 'kiosk') { setRoute(r); setParams({}); } }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);

  useEffect(() => {
    if (!token) return;
    api.get('/me').then((m) => { if (m.role === 'worker') signIn(null); else setMe(m); }).catch(() => signIn(null));
  }, [token]);
  const can = useCallback((perm) => !!me?.perms.includes(perm), [me]);

  useEffect(() => {
    if (!token || !can('board.read')) return;
    const f = () => api.get('/stats').then((s) => { setPending(s.pendingReview + s.pendingCorr + s.pendingLeave); setUnseen(s.unseenAlerts ?? 0); }).catch((e) => { if (e.message === 'unauthorized') signIn(null); });
    f(); const t = setInterval(f, 15000); return () => clearInterval(t);
  }, [token, me, route]);

  if (!token) return <Login onToken={signIn} />;
  if (!me) return <div className="empty" style={{ paddingTop: 120 }}>Loading...</div>;

  const pages = PAGES.filter(([, , , perm]) => can(perm));
  const current = pages.find(([r]) => r === route) ?? pages[0];
  const View = current[4];
  const groups = [...new Set(pages.map((p) => p[5]))];
  const onSearch = (e) => { if (e.key === 'Enter' && can('workers.read')) { go('employees', { q: search }); setSearch(''); } };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><div className="logo"><MapPinCheck size={20} color="#fff" /></div><div>GeoWork<small>Attendance platform</small></div></div>
        {groups.map((g) => (
          <React.Fragment key={g}>
            {g && <div className="group">{g}</div>}
            {pages.filter((p) => p[5] === g).map(([r, label, Icon]) => (
              <button key={r} className={`nav ${current[0] === r ? 'on' : ''}`} onClick={() => go(r)}>
                <Icon size={18} />{label}{r === 'approvals' && pending > 0 && <span className="badge">{pending}</span>}
              </button>
            ))}
          </React.Fragment>
        ))}
        <div className="me">
          <Avatar name={me.name} size={38} />
          <div style={{ minWidth: 0 }}><b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</b><small>{me.label}{me.role === 'supervisor' && me.site ? ` · ${me.site.name}` : ''}</small></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="search"><Search size={16} /><input placeholder="Search employees, press Enter" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearch} /></div>
          <div className="sp" />
          {synced && <span className="muted" title="Data on this page refreshes automatically" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--ok)', display: 'inline-block' }} />Live &middot; {synced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
          {me.role === 'auditor' && <span className="pill p-violet">Read-only</span>}
          <button className="icon-btn" title={unseen > 0 ? 'Approvals and on-duty alerts' : 'Approvals'} onClick={() => (pending === 0 && unseen > 0) || !can('approve.read') ? go('dashboard') : go('approvals')}><Bell size={18} />{pending + unseen > 0 && <span className="badge">{pending + unseen}</span>}</button>
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-btn" title="Sign out" onClick={() => signIn(null)}><LogOut size={18} /></button>
        </header>
        <main className="content" key={current[0]}>
          <Boundary k={current[0]}><View api={api} token={token} me={me} toast={toast} can={can} go={go} params={params} /></Boundary>
        </main>
      </div>
      <Toast text={msg} />
    </div>
  );
}

export default function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const f = () => setHash(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return hash.startsWith('#/kiosk') ? <Kiosk /> : <AdminApp />;
}
