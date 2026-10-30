import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { openDb, newUser } from './db.js';
import { checkFence } from './geofence.js';
import { scoreRisk } from './risk.js';
import { attendanceStatus } from './status.js';
import { ROLES, STAFF_ROLES, can } from './roles.js';
import { registerExtras } from './extras.js';
import { registerExtras2 } from './extras2.js';

const dayKey = (ts, tz) => new Date(ts + tz * 60000).toISOString().slice(0, 10);
const levelOf = (score) => (score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low');

export async function buildApp({ mongoUri, dbName = 'geowork', secret = 'dev-secret-change-me' } = {}) {
  const app = Fastify();
  const db = await openDb(mongoUri, dbName);
  app.addHook('onClose', async () => { await db.close(); });
  app.register(cors, { origin: true });
  app.register(jwt, { secret });

  const audit = (org_id, actor_id, action, detail) =>
    db.insert('audit', { org_id, actor_id, action, detail: JSON.stringify(detail ?? {}), ts: Date.now() });
  const tzOf = async (org_id) => (await db.one('orgs', { id: org_id })).tz_offset_min;
  const nameMap = async (org_id) => Object.fromEntries((await db.find('users', { org_id }, { projection: { id: 1, name: 1 } })).map((u) => [u.id, u.name]));
  const iso = (ts) => new Date(ts).toISOString();

  const auth = async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.code(401).send({ error: 'unauthorized' }); }
  };
  // Route guard: signed in, still active, and the role holds the permission. Role is read from the DB, not the token,
  // so changing or disabling a staff account takes effect immediately. An empty perm means "any signed-in user".
  const guard = (perm) => async (req, reply) => {
    await auth(req, reply);
    if (reply.sent) return;
    const u = await db.one('users', { id: req.user.id }, { projection: { role: 1, active: 1, site_id: 1 } });
    if (!u || !u.active) return reply.code(401).send({ error: 'unauthorized' });
    req.user.role = u.role;
    req.user.site_id = u.site_id;
    if (perm && !can(u.role, perm)) return reply.code(403).send({ error: 'forbidden', need: perm });
  };
  // Supervisors only see workers at their own site. Others see the whole organisation (null = no limit).
  const visible = async (req) => {
    if (req.user.role !== 'supervisor') return null;
    return new Set((await db.find('users', { org_id: req.user.org_id, role: 'worker', site_id: req.user.site_id ?? null }, { projection: { id: 1 } })).map((r) => r.id));
  };
  const seen = (set, id) => !set || set.has(id);

  app.post('/auth/register-org', async (req, reply) => {
    const { orgName, name, email, password, tz_offset_min = 0 } = req.body ?? {};
    if (!orgName || !name || !email || !password) return reply.code(400).send({ error: 'missing_fields' });
    if (await db.one('users', { email })) return reply.code(409).send({ error: 'email_taken' });
    const org_id = await db.insert('orgs', { name: orgName, tz_offset_min });
    const id = await db.insert('users', newUser({ org_id, name, email, password_hash: bcrypt.hashSync(password, 8), role: 'owner' }));
    return { token: app.jwt.sign({ id, org_id, role: 'owner' }) };
  });

  app.post('/auth/login', async (req, reply) => {
    const { email, password, device_id } = req.body ?? {};
    const u = await db.one('users', { email: email ?? '' });
    if (!u || !bcrypt.compareSync(password ?? '', u.password_hash)) return reply.code(401).send({ error: 'bad_credentials' });
    if (!u.active) return reply.code(403).send({ error: 'account_disabled' });
    if (u.role === 'worker' && device_id && !u.device_id) {
      await db.update('users', { id: u.id }, { device_id });
      await audit(u.org_id, u.id, 'device_bound', { device_id });
    }
    return {
      token: app.jwt.sign({ id: u.id, org_id: u.org_id, role: u.role }),
      user: { id: u.id, name: u.name, role: u.role, label: ROLES[u.role]?.label, perms: ROLES[u.role]?.perms ?? [] },
    };
  });

  app.get('/me', { preHandler: auth }, async (req) => {
    const u = await db.one('users', { id: req.user.id }, { projection: { id: 1, name: 1, email: 1, role: 1, site_id: 1, shift_start: 1, shift_end: 1, grace_min: 1, department: 1, device_id: 1 } });
    const site = u.site_id ? await db.one('sites', { id: u.site_id }) : null;
    return { ...u, site, label: ROLES[u.role]?.label, perms: ROLES[u.role]?.perms ?? [] };
  });

  app.get('/roles', { preHandler: auth }, async () => ROLES);

  // ---- sites
  app.post('/sites', { preHandler: guard('sites.write') }, async (req, reply) => {
    const { name, type, lat, lng, radius_m, points } = req.body ?? {};
    if (!name || !['circle', 'polygon'].includes(type)) return reply.code(400).send({ error: 'bad_site' });
    if (type === 'circle' && !(typeof lat === 'number' && typeof lng === 'number' && radius_m >= 50))
      return reply.code(400).send({ error: 'circle_needs_lat_lng_radius_min_50' });
    if (type === 'polygon' && !(Array.isArray(points) && points.length >= 3))
      return reply.code(400).send({ error: 'polygon_needs_3_points' });
    const id = await db.insert('sites', { org_id: req.user.org_id, name, type, lat: lat ?? null, lng: lng ?? null, radius_m: radius_m ?? null, points: points ?? null, auto_attendance: req.body.auto_attendance === false ? 0 : 1 });
    await audit(req.user.org_id, req.user.id, 'site_created', { name, type });
    return { id };
  });
  app.get('/sites', { preHandler: auth }, async (req) => (await db.find('sites', { org_id: req.user.org_id })).map((s) => ({ ...s, points: s.points ?? undefined })));

  // ---- workers
  app.post('/workers', { preHandler: guard('workers.write') }, async (req, reply) => {
    const { name, email, password, site_id = null, shift_start = '09:00', shift_end = '18:00', grace_min = 10, department = 'General' } = req.body ?? {};
    if (!name || !email || !password) return reply.code(400).send({ error: 'missing_fields' });
    if (await db.one('users', { email })) return reply.code(409).send({ error: 'email_taken' });
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const id = await db.insert('users', newUser({
      org_id: req.user.org_id, name, email, password_hash: bcrypt.hashSync(password, 8), role: 'worker', site_id,
      shift_start, shift_end, grace_min, department: department || 'General', pin_hash: bcrypt.hashSync(pin, 8),
    }));
    await audit(req.user.org_id, req.user.id, 'worker_created', { name, email });
    return { id, pin };
  });
  app.get('/workers', { preHandler: guard('workers.read') }, async (req) =>
    db.find('users', { org_id: req.user.org_id, role: 'worker' }, { projection: { id: 1, name: 1, email: 1, site_id: 1, shift_start: 1, shift_end: 1, grace_min: 1, department: 1, device_id: 1, active: 1 } }));
  app.patch('/workers/:id', { preHandler: guard('workers.write') }, async (req, reply) => {
    const w = await db.one('users', { id: Number(req.params.id), org_id: req.user.org_id, role: 'worker' });
    if (!w) return reply.code(404).send({ error: 'not_found' });
    const b = req.body ?? {};
    await db.update('users', { id: w.id }, {
      site_id: 'site_id' in b ? b.site_id : w.site_id, shift_start: b.shift_start ?? w.shift_start, shift_end: b.shift_end ?? w.shift_end,
      grace_min: b.grace_min ?? w.grace_min, department: b.department ?? w.department, name: b.name ?? w.name,
      device_id: b.reset_device ? null : w.device_id,
    });
    await audit(req.user.org_id, req.user.id, 'worker_updated', { id: w.id, ...b });
    return { ok: true };
  });

  // ---- punch (the server decides, never the phone)
  app.post('/punch', { preHandler: auth }, async (req, reply) => {
    if (req.user.role !== 'worker') return reply.code(403).send({ error: 'workers_only' });
    const b = req.body ?? {};
    // Automatic attendance: the phone reports that the OS saw it enter/leave the work area. Same server-side checks, plus
    // tolerance for the OS's coarser location, and noisy duplicate events are ignored instead of rejected.
    const auto = b.source === 'auto' && ['enter', 'exit'].includes(b.event);
    if (auto) b.kind = b.event === 'enter' ? 'in' : 'out';
    if (!['in', 'out'].includes(b.kind) || typeof b.lat !== 'number' || typeof b.lng !== 'number')
      return reply.code(400).send({ error: 'bad_punch' });
    const u = await db.one('users', { id: req.user.id });
    if (!u.site_id) return reply.code(409).send({ error: 'no_site_assigned' });
    const site = await db.one('sites', { id: u.site_id });
    if (auto && site.auto_attendance === 0) return reply.code(409).send({ error: 'auto_disabled' });
    const tz = await tzOf(u.org_id);
    const now = Date.now();
    const offline = b.offline ? 1 : 0;
    let ts = now;
    const extra = [];
    if (typeof b.device_ts === 'number' && b.device_ts <= now + 60000) {
      const age = now - b.device_ts;
      if (offline && age < 48 * 3600000) { ts = b.device_ts; extra.push('offline_time_unverified'); }
      else if (auto && age < 30 * 60000) ts = Math.min(b.device_ts, now); // the moment the OS saw the phone cross the boundary
    }

    const fence = checkFence(site, { lat: b.lat, lng: b.lng }, b.accuracy);
    const leavingAuto = auto && b.kind === 'out'; // leaving means being outside the fence, so only entering must be inside
    if (!leavingAuto) {
      if (!fence.inside) {
        await audit(u.org_id, u.id, 'punch_rejected_outside', { distance_m: fence.distance_m });
        return reply.code(403).send({ error: 'outside_fence', distance_m: fence.distance_m });
      }
      const accOk = typeof b.accuracy === 'number' && b.accuracy <= (auto ? 150 : 50);
      if (!accOk && !offline) return reply.code(422).send({ error: 'gps_accuracy_too_low' });
    }

    const prevRow = await db.last('punches', { user_id: u.id });
    const prev = prevRow && { ts: prevRow.server_ts, lat: prevRow.lat, lng: prevRow.lng };
    const risk = scoreRisk({
      mock: !!b.mock, accuracy: b.accuracy, deviceMatches: !u.device_id || u.device_id === b.device_id,
      previous: prev, point: { lat: b.lat, lng: b.lng }, now: ts,
    });
    if (extra.length) { risk.score = Math.min(100, risk.score + 15); risk.reasons.push(...extra); risk.level = levelOf(risk.score); }
    if (risk.reasons.includes('mock_location') && !offline) {
      await audit(u.org_id, u.id, 'punch_rejected_mock', {});
      return reply.code(403).send({ error: 'mock_location_detected' });
    }

    if (auto) {
      // The OS can fire the same transition twice or bounce at the edge: ignore it quietly.
      if (b.kind === 'in' && prevRow?.kind === 'in') return { ignored: true, reason: 'already_checked_in' };
      if (b.kind === 'out' && prevRow?.kind !== 'in') return { ignored: true, reason: 'not_checked_in' };
      if (b.kind === 'out' && ts - prevRow.server_ts < 60000) return { ignored: true, reason: 'just_arrived' };
    }
    if (b.kind === 'in' && prevRow?.kind === 'in') return reply.code(409).send({ error: 'already_checked_in' });
    if (b.kind === 'out' && prevRow?.kind !== 'in') return reply.code(409).send({ error: 'not_checked_in' });

    const day = dayKey(ts, tz);
    const todays = (await db.find('punches', { user_id: u.id, kind: 'in' }, { projection: { server_ts: 1 } })).filter((p) => dayKey(p.server_ts, tz) === day);
    const status = b.kind === 'in' && todays.length === 0
      ? attendanceStatus({ start: u.shift_start, grace_min: u.grace_min }, new Date(ts), tz) : null;
    const review = risk.level === 'high' ? 'pending' : 'auto';

    const id = await db.insert('punches', {
      org_id: u.org_id, user_id: u.id, site_id: site.id, kind: b.kind, server_ts: ts, device_ts: b.device_ts ?? null,
      lat: b.lat, lng: b.lng, accuracy: b.accuracy ?? null, device_id: b.device_id ?? null, mock: b.mock ? 1 : 0, inside: 1,
      risk_score: risk.score, risk_level: risk.level, risk_reasons: risk.reasons, status, offline, review, source: auto ? 'auto' : 'app',
    });
    return { id, kind: b.kind, status, risk, review, source: auto ? 'auto' : 'app', at: iso(ts) };
  });

  app.get('/punches/mine', { preHandler: auth }, async (req) =>
    (await db.find('punches', { user_id: req.user.id }, { sort: { id: -1 }, limit: 100, projection: { id: 1, kind: 1, server_ts: 1, status: 1, risk_level: 1, review: 1, offline: 1 } }))
      .map((p) => ({ ...p, at: iso(p.server_ts) })));

  // ---- admin board & review
  app.get('/board', { preHandler: guard('board.read') }, async (req) => {
    const vis = await visible(req);
    const tz = await tzOf(req.user.org_id);
    const today = dayKey(Date.now(), tz);
    const local = new Date(Date.now() + tz * 60000);
    const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
    const workers = (await db.find('users', { org_id: req.user.org_id, role: 'worker', active: 1 }, { projection: { id: 1, name: 1, department: 1, shift_start: 1, grace_min: 1 } })).filter((w) => seen(vis, w.id));
    const recent = await db.find('punches', { org_id: req.user.org_id, server_ts: { $gte: Date.now() - 3 * 86400000 } }, { sort: { id: 1 }, projection: { user_id: 1, kind: 1, server_ts: 1, status: 1, risk_level: 1 } });
    return workers.map((w) => {
      const ps = recent.filter((p) => p.user_id === w.id && dayKey(p.server_ts, tz) === today);
      const firstIn = ps.find((p) => p.kind === 'in');
      const last = ps[ps.length - 1];
      const [h, m] = w.shift_start.split(':').map(Number);
      const pastGrace = nowMin > h * 60 + m + w.grace_min;
      const state = !firstIn ? (pastGrace ? 'absent' : 'expected') : last.kind === 'in' ? 'in' : 'left';
      return { id: w.id, name: w.name, department: w.department, state, status: firstIn?.status ?? null, first_in: firstIn ? iso(firstIn.server_ts) : null, risk: last?.risk_level ?? null };
    });
  });

  app.get('/punches/review', { preHandler: guard('approve.read') }, async (req) => {
    const vis = await visible(req);
    const names = await nameMap(req.user.org_id);
    return (await db.find('punches', { org_id: req.user.org_id, review: 'pending' }, { sort: { id: -1 } }))
      .filter((p) => seen(vis, p.user_id)).map((p) => ({ ...p, name: names[p.user_id], risk_reasons: JSON.stringify(p.risk_reasons ?? []) }));
  });
  app.post('/punches/:id/review', { preHandler: guard('approve.write') }, async (req, reply) => {
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return reply.code(400).send({ error: 'bad_decision' });
    const row = await db.one('punches', { id: Number(req.params.id), org_id: req.user.org_id }, { projection: { user_id: 1 } });
    if (!row || !seen(await visible(req), row.user_id)) return reply.code(404).send({ error: 'not_found' });
    if (!(await db.update('punches', { id: Number(req.params.id), org_id: req.user.org_id, review: 'pending' }, { review: decision }))) return reply.code(404).send({ error: 'not_found' });
    await audit(req.user.org_id, req.user.id, 'punch_reviewed', { id: Number(req.params.id), decision });
    return { ok: true };
  });

  // ---- corrections
  app.post('/corrections', { preHandler: auth }, async (req, reply) => {
    const { day, kind, requested_time, reason } = req.body ?? {};
    if (!day || !['in', 'out'].includes(kind) || !requested_time || !reason) return reply.code(400).send({ error: 'missing_fields' });
    const id = await db.insert('corrections', { org_id: req.user.org_id, user_id: req.user.id, day, kind, requested_time, reason, state: 'pending', created_ts: Date.now() });
    return { id };
  });
  app.get('/corrections', { preHandler: guard('') }, async (req) => {
    if (!can(req.user.role, 'approve.read')) return db.find('corrections', { user_id: req.user.id }, { sort: { id: -1 } });
    const vis = await visible(req);
    const names = await nameMap(req.user.org_id);
    return (await db.find('corrections', { org_id: req.user.org_id }, { sort: { id: -1 } })).filter((c) => seen(vis, c.user_id)).map((c) => ({ ...c, name: names[c.user_id] }));
  });
  app.post('/corrections/:id/decision', { preHandler: guard('approve.write') }, async (req, reply) => {
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return reply.code(400).send({ error: 'bad_decision' });
    const row = await db.one('corrections', { id: Number(req.params.id), org_id: req.user.org_id }, { projection: { user_id: 1 } });
    if (!row || !seen(await visible(req), row.user_id)) return reply.code(404).send({ error: 'not_found' });
    if (!(await db.update('corrections', { id: Number(req.params.id), org_id: req.user.org_id, state: 'pending' }, { state: decision }))) return reply.code(404).send({ error: 'not_found' });
    await audit(req.user.org_id, req.user.id, 'correction_decided', { id: Number(req.params.id), decision });
    return { ok: true };
  });

  // ---- reports
  app.get('/reports/attendance', { preHandler: guard('reports.read') }, async (req, reply) => {
    const { from, to, format } = req.query;
    const tz = await tzOf(req.user.org_id);
    const vis = await visible(req);
    const names = await nameMap(req.user.org_id);
    const all = (await db.find('punches', { org_id: req.user.org_id, review: { $ne: 'rejected' } }, { sort: { server_ts: 1, id: 1 } })).filter((p) => seen(vis, p.user_id));
    const brk = await db.find('breaks', { org_id: req.user.org_id });
    const breakMs = (uid, day) => brk.filter((b) => b.user_id === uid && dayKey(b.start_ts, tz) === day && b.end_ts).reduce((a, b) => a + b.end_ts - b.start_ts, 0);
    const byKey = new Map();
    for (const p of all) {
      const k = p.user_id + '|' + dayKey(p.server_ts, tz);
      if (!byKey.has(k)) byKey.set(k, { uid: p.user_id, day: dayKey(p.server_ts, tz), worker: names[p.user_id], check_in: null, check_out: null, status: null, risk: 'low', ms: 0, open: null });
      const r = byKey.get(k);
      if (p.kind === 'in') { r.check_in ??= p.server_ts; r.status ??= p.status; r.open = p.server_ts; }
      else { r.check_out = p.server_ts; if (r.open) { r.ms += p.server_ts - r.open; r.open = null; } }
      if (p.risk_level === 'high' || (p.risk_level === 'medium' && r.risk === 'low')) r.risk = p.risk_level;
    }
    const rows = [...byKey.values()].filter((r) => r.check_in && (!from || r.day >= from) && (!to || r.day <= to))
      .map((r) => ({ day: r.day, worker: r.worker, check_in: iso(r.check_in), check_out: r.check_out ? iso(r.check_out) : null,
        hours: Math.round((Math.max(0, r.ms - breakMs(r.uid, r.day)) / 3600000) * 100) / 100, status: r.status, risk: r.risk }));
    if (format === 'csv') {
      reply.header('content-type', 'text/csv');
      return ['day,worker,check_in,check_out,hours,status,risk', ...rows.map((r) => `${r.day},"${r.worker}",${r.check_in},${r.check_out ?? ''},${r.hours},${r.status},${r.risk}`)].join('\n');
    }
    return rows;
  });

  // ---- staff accounts (owner only): hr, supervisor, auditor
  app.get('/staff', { preHandler: guard('staff.manage') }, async (req) =>
    (await db.find('users', { org_id: req.user.org_id, role: { $ne: 'worker' } }, { projection: { id: 1, name: 1, email: 1, role: 1, site_id: 1, active: 1 } }))
      .map((u) => ({ ...u, label: ROLES[u.role]?.label })));
  app.post('/staff', { preHandler: guard('staff.manage') }, async (req, reply) => {
    const { name, email, password, role, site_id = null } = req.body ?? {};
    if (!name || !email || !password || !STAFF_ROLES.includes(role)) return reply.code(400).send({ error: 'missing_fields' });
    if (role === 'supervisor' && !site_id) return reply.code(400).send({ error: 'supervisor_needs_site' });
    if (site_id && !(await db.one('sites', { id: site_id, org_id: req.user.org_id }))) return reply.code(400).send({ error: 'bad_site' });
    if (await db.one('users', { email })) return reply.code(409).send({ error: 'email_taken' });
    const id = await db.insert('users', newUser({ org_id: req.user.org_id, name, email, password_hash: bcrypt.hashSync(password, 8), role, site_id: role === 'supervisor' ? site_id : null }));
    await audit(req.user.org_id, req.user.id, 'staff_created', { name, email, role });
    return { id };
  });
  app.patch('/staff/:id', { preHandler: guard('staff.manage') }, async (req, reply) => {
    const u = await db.one('users', { id: Number(req.params.id), org_id: req.user.org_id, role: { $nin: ['worker', 'owner'] } });
    if (!u) return reply.code(404).send({ error: 'not_found' });
    const b = req.body ?? {};
    const role = b.role ?? u.role;
    if (!STAFF_ROLES.includes(role)) return reply.code(400).send({ error: 'bad_role' });
    const site = role === 'supervisor' ? ('site_id' in b ? b.site_id : u.site_id) : null;
    if (role === 'supervisor' && !site) return reply.code(400).send({ error: 'supervisor_needs_site' });
    await db.update('users', { id: u.id }, { role, site_id: site, active: 'active' in b ? (b.active ? 1 : 0) : u.active });
    await audit(req.user.org_id, req.user.id, 'staff_updated', { id: u.id, ...b });
    return { ok: true };
  });

  // ---- site edit / delete
  app.patch('/sites/:id', { preHandler: guard('sites.write') }, async (req, reply) => {
    const s = await db.one('sites', { id: Number(req.params.id), org_id: req.user.org_id });
    if (!s) return reply.code(404).send({ error: 'not_found' });
    const b = req.body ?? {};
    if (b.radius_m !== undefined && !(b.radius_m >= 50)) return reply.code(400).send({ error: 'radius_min_50' });
    await db.update('sites', { id: s.id }, { name: b.name ?? s.name, lat: b.lat ?? s.lat, lng: b.lng ?? s.lng, radius_m: b.radius_m ?? s.radius_m, points: b.points ?? s.points, auto_attendance: 'auto_attendance' in b ? (b.auto_attendance ? 1 : 0) : (s.auto_attendance ?? 1) });
    await audit(req.user.org_id, req.user.id, 'site_updated', { id: s.id, ...b });
    return { ok: true };
  });
  app.delete('/sites/:id', { preHandler: guard('sites.write') }, async (req, reply) => {
    if (!(await db.remove('sites', { id: Number(req.params.id), org_id: req.user.org_id }))) return reply.code(404).send({ error: 'not_found' });
    await db.updateMany('users', { site_id: Number(req.params.id) }, { site_id: null });
    await audit(req.user.org_id, req.user.id, 'site_deleted', { id: Number(req.params.id) });
    return { ok: true };
  });
  app.post('/workers/:id/active', { preHandler: guard('workers.write') }, async (req, reply) => {
    if (!(await db.update('users', { id: Number(req.params.id), org_id: req.user.org_id, role: 'worker' }, { active: req.body?.active ? 1 : 0 }))) return reply.code(404).send({ error: 'not_found' });
    await audit(req.user.org_id, req.user.id, 'worker_active', { id: Number(req.params.id), active: !!req.body?.active });
    return { ok: true };
  });

  // ---- leave requests
  app.post('/leaves', { preHandler: auth }, async (req, reply) => {
    const { from_day, to_day, type = 'casual', reason = '' } = req.body ?? {};
    if (!from_day || !to_day || to_day < from_day) return reply.code(400).send({ error: 'bad_dates' });
    const id = await db.insert('leaves', { org_id: req.user.org_id, user_id: req.user.id, from_day, to_day, type, reason, state: 'pending', created_ts: Date.now() });
    return { id };
  });
  app.get('/leaves', { preHandler: guard('') }, async (req) => {
    if (!can(req.user.role, 'approve.read')) return db.find('leaves', { user_id: req.user.id }, { sort: { id: -1 } });
    const vis = await visible(req);
    const names = await nameMap(req.user.org_id);
    return (await db.find('leaves', { org_id: req.user.org_id }, { sort: { id: -1 } })).filter((l) => seen(vis, l.user_id)).map((l) => ({ ...l, name: names[l.user_id] }));
  });
  app.post('/leaves/:id/decision', { preHandler: guard('approve.write') }, async (req, reply) => {
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return reply.code(400).send({ error: 'bad_decision' });
    const row = await db.one('leaves', { id: Number(req.params.id), org_id: req.user.org_id }, { projection: { user_id: 1 } });
    if (!row || !seen(await visible(req), row.user_id)) return reply.code(404).send({ error: 'not_found' });
    if (!(await db.update('leaves', { id: Number(req.params.id), org_id: req.user.org_id, state: 'pending' }, { state: decision }))) return reply.code(404).send({ error: 'not_found' });
    await audit(req.user.org_id, req.user.id, 'leave_decided', { id: Number(req.params.id), decision });
    return { ok: true };
  });

  // ---- worker summary (hours today, month counts)
  app.get('/me/summary', { preHandler: auth }, async (req) => {
    const tz = await tzOf(req.user.org_id);
    const today = dayKey(Date.now(), tz);
    const ps = await db.find('punches', { user_id: req.user.id, review: { $ne: 'rejected' } }, { sort: { id: 1 }, projection: { kind: 1, server_ts: 1, status: 1 } });
    let worked = 0, openSince = null, present = 0, late = 0;
    for (const p of ps) {
      const d = dayKey(p.server_ts, tz);
      if (p.kind === 'in') {
        if (d === today) openSince = p.server_ts;
        if (p.status === 'present' && d.slice(0, 7) === today.slice(0, 7)) present++;
        if (p.status === 'late' && d.slice(0, 7) === today.slice(0, 7)) late++;
      } else if (openSince && d === today) { worked += p.server_ts - openSince; openSince = null; }
    }
    return { worked_ms: worked, open_since: openSince, month_present: present, month_late: late };
  });

  // ---- dashboard stats
  app.get('/stats', { preHandler: guard('board.read') }, async (req) => {
    const tz = await tzOf(req.user.org_id);
    const vis = await visible(req);
    const workers = (await db.find('users', { org_id: req.user.org_id, role: 'worker', active: 1 }, { projection: { id: 1, name: 1 } })).filter((w) => seen(vis, w.id));
    const ins = (await db.find('punches', { org_id: req.user.org_id, kind: 'in', status: { $ne: null }, review: { $ne: 'rejected' } }, { projection: { user_id: 1, server_ts: 1, status: 1 } })).filter((p) => seen(vis, p.user_id));
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = dayKey(Date.now() - i * 86400000, tz);
      const rows = ins.filter((p) => dayKey(p.server_ts, tz) === d);
      days.push({ day: d, present: rows.filter((r) => r.status === 'present').length, late: rows.filter((r) => r.status === 'late').length, absent: Math.max(0, workers.length - rows.length) });
    }
    const lateBy = {};
    ins.filter((p) => p.status === 'late').forEach((p) => { lateBy[p.user_id] = (lateBy[p.user_id] ?? 0) + 1; });
    const topLate = workers.map((w) => ({ name: w.name, late: lateBy[w.id] ?? 0 })).filter((w) => w.late).sort((a, b) => b.late - a.late).slice(0, 5);
    const risky = (await db.find('punches', { org_id: req.user.org_id, risk_level: { $ne: 'low' } }, { projection: { user_id: 1 } })).filter((p) => seen(vis, p.user_id)).length;
    const count = async (col, filter) => (await db.find(col, { org_id: req.user.org_id, ...filter }, { projection: { user_id: 1 } })).filter((r) => seen(vis, r.user_id)).length;
    return { workers: workers.length, days, topLate, risky, pendingReview: await count('punches', { review: 'pending' }), pendingCorr: await count('corrections', { state: 'pending' }), pendingLeave: await count('leaves', { state: 'pending' }) };
  });

  app.get('/audit', { preHandler: guard('audit.read') }, async (req) =>
    db.find('audit', { org_id: req.user.org_id }, { sort: { id: -1 }, limit: 200 }));

  registerExtras(app, { db, auth, guard, visible, seen, audit, tzOf, dayKey, nameMap });
  registerExtras2(app, { db, guard, visible, seen, tzOf, dayKey, nameMap });

  await app.ready();
  return app;
}
