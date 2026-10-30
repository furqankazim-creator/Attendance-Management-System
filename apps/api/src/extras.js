import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { attendanceStatus } from './status.js';

const MS_DAY = 86400000;
const FAIL_LIMIT = 5;
const LOCK_MS = 5 * 60000;

/** Hours worked per day (ms), keyed by the day of check-in. Open shifts (no check-out yet) count as 0. */
export async function hoursByDay(db, userId, tz, dayKey) {
  const brk = await db.find('breaks', { user_id: userId, end_ts: { $ne: null } });
  const ps = await db.find('punches', { user_id: userId, review: { $ne: 'rejected' } }, { sort: { server_ts: 1, id: 1 }, projection: { kind: 1, server_ts: 1 } });
  const out = {};
  let open = null;
  for (const p of ps) {
    if (p.kind === 'in') open = p.server_ts;
    else if (open !== null) {
      const d = dayKey(open, tz);
      out[d] = (out[d] ?? 0) + (p.server_ts - open);
      open = null;
    }
  }
  for (const b of brk) { const d = dayKey(b.start_ts, tz); if (out[d]) out[d] = Math.max(0, out[d] - (b.end_ts - b.start_ts)); }
  return out;
}

const weekDays = (start) => Array.from({ length: 7 }, (_, i) => new Date(Date.parse(start + 'T00:00:00Z') + i * MS_DAY).toISOString().slice(0, 10));
const isMonday = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && new Date(d + 'T00:00:00Z').getUTCDay() === 1;
const centre = (site) => {
  if (site.type === 'circle') return { lat: site.lat, lng: site.lng };
  const pts = site.points;
  return { lat: pts.reduce((a, p) => a + p[0], 0) / pts.length, lng: pts.reduce((a, p) => a + p[1], 0) / pts.length };
};

export function registerExtras(app, { db, auth, guard, visible, seen, audit, tzOf, dayKey, nameMap }) {
  // ---------- live map: who is where (locations exist only at punch time, never between punches)
  app.get('/map', { preHandler: guard('board.read') }, async (req) => {
    const tz = await tzOf(req.user.org_id);
    const day = req.query.day ?? dayKey(Date.now(), tz);
    const vis = await visible(req);
    const sites = (await db.find('sites', { org_id: req.user.org_id })).map((s) => ({ ...s, points: s.points ?? undefined }));
    const workers = (await db.find('users', { org_id: req.user.org_id, role: 'worker', active: 1 }, { projection: { id: 1, name: 1 } })).filter((w) => seen(vis, w.id));
    const ps = await db.find('punches', { org_id: req.user.org_id }, { sort: { server_ts: 1, id: 1 }, projection: { user_id: 1, kind: 1, lat: 1, lng: 1, server_ts: 1, risk_level: 1, source: 1 } });
    return {
      day, sites,
      workers: workers.map((w) => {
        const points = ps.filter((p) => p.user_id === w.id && dayKey(p.server_ts, tz) === day)
          .map((p) => ({ kind: p.kind, lat: p.lat, lng: p.lng, at: new Date(p.server_ts).toISOString(), risk: p.risk_level, source: p.source }));
        return { id: w.id, name: w.name, last: points[points.length - 1] ?? null, points };
      }).filter((w) => w.points.length),
    };
  });

  // ---------- weekly timesheets
  app.get('/timesheets/week', { preHandler: guard('') }, async (req, reply) => {
    const start = req.query.start;
    if (!isMonday(start)) return reply.code(400).send({ error: 'week_must_start_monday' });
    const tz = await tzOf(req.user.org_id);
    const by = await hoursByDay(db, req.user.id, tz, dayKey);
    const days = weekDays(start).map((d) => ({ day: d, ms: by[d] ?? 0 }));
    const row = await db.one('timesheets', { user_id: req.user.id, week_start: start });
    return { week_start: start, days, total_ms: days.reduce((a, d) => a + d.ms, 0), state: row?.state ?? 'open', note: row?.note ?? null };
  });

  app.post('/timesheets/submit', { preHandler: guard('') }, async (req, reply) => {
    if (req.user.role !== 'worker') return reply.code(403).send({ error: 'workers_only' });
    const start = req.body?.week_start;
    if (!isMonday(start)) return reply.code(400).send({ error: 'week_must_start_monday' });
    const tz = await tzOf(req.user.org_id);
    if (start > dayKey(Date.now(), tz)) return reply.code(400).send({ error: 'week_in_future' });
    const existing = await db.one('timesheets', { user_id: req.user.id, week_start: start });
    if (existing && ['submitted', 'approved'].includes(existing.state)) return reply.code(409).send({ error: `already_${existing.state}` });
    const by = await hoursByDay(db, req.user.id, tz, dayKey);
    const total = weekDays(start).reduce((a, d) => a + (by[d] ?? 0), 0);
    if (existing) await db.update('timesheets', { id: existing.id }, { state: 'submitted', total_ms: total, note: null, submitted_ts: Date.now() });
    else await db.insert('timesheets', { org_id: req.user.org_id, user_id: req.user.id, week_start: start, state: 'submitted', total_ms: total, note: null, submitted_ts: Date.now(), decided_by: null });
    return { ok: true, total_ms: total };
  });

  app.get('/timesheets', { preHandler: guard('approve.read') }, async (req) => {
    const vis = await visible(req);
    const names = await nameMap(req.user.org_id);
    return (await db.find('timesheets', { org_id: req.user.org_id }, { sort: { id: -1 } })).filter((t) => seen(vis, t.user_id)).map((t) => ({ ...t, name: names[t.user_id] }));
  });

  app.post('/timesheets/:id/decision', { preHandler: guard('approve.write') }, async (req, reply) => {
    const { decision, note = null } = req.body ?? {};
    if (!['approved', 'rejected'].includes(decision)) return reply.code(400).send({ error: 'bad_decision' });
    const t = await db.one('timesheets', { id: Number(req.params.id), org_id: req.user.org_id });
    if (!t || !seen(await visible(req), t.user_id)) return reply.code(404).send({ error: 'not_found' });
    if (t.state !== 'submitted') return reply.code(409).send({ error: 'not_submitted' });
    await db.update('timesheets', { id: t.id }, { state: decision, note, decided_by: req.user.id });
    await audit(req.user.org_id, req.user.id, 'timesheet_decided', { id: t.id, decision });
    return { ok: true };
  });

  // ---------- worker PIN (for kiosk) and kiosk devices
  const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');
  app.post('/workers/:id/pin', { preHandler: guard('workers.write') }, async (req, reply) => {
    const pin = newPin();
    if (!(await db.update('users', { id: Number(req.params.id), org_id: req.user.org_id, role: 'worker' }, { pin_hash: bcrypt.hashSync(pin, 8) }))) return reply.code(404).send({ error: 'not_found' });
    await audit(req.user.org_id, req.user.id, 'pin_reset', { id: Number(req.params.id) });
    return { pin }; // shown once; only a hash is stored
  });

  app.post('/kiosks', { preHandler: guard('sites.write') }, async (req, reply) => {
    const { name, site_id } = req.body ?? {};
    if (!name || !(await db.one('sites', { id: site_id, org_id: req.user.org_id }))) return reply.code(400).send({ error: 'bad_kiosk' });
    const token = crypto.randomBytes(24).toString('hex');
    const id = await db.insert('kiosks', { org_id: req.user.org_id, site_id, name, token, active: 1 });
    await audit(req.user.org_id, req.user.id, 'kiosk_created', { name, site_id });
    return { id, token };
  });
  app.get('/kiosks', { preHandler: guard('sites.write') }, async (req) => {
    const sites = Object.fromEntries((await db.find('sites', { org_id: req.user.org_id }, { projection: { id: 1, name: 1 } })).map((s) => [s.id, s.name]));
    return (await db.find('kiosks', { org_id: req.user.org_id })).filter((k) => sites[k.site_id]).map((k) => ({ id: k.id, name: k.name, site_id: k.site_id, token: k.token, active: k.active, site: sites[k.site_id] }));
  });
  app.delete('/kiosks/:id', { preHandler: guard('sites.write') }, async (req, reply) => {
    if (!(await db.remove('kiosks', { id: Number(req.params.id), org_id: req.user.org_id }))) return reply.code(404).send({ error: 'not_found' });
    await audit(req.user.org_id, req.user.id, 'kiosk_deleted', { id: Number(req.params.id) });
    return { ok: true };
  });

  // The kiosk is a fixed device registered to one site, so its punches carry the site position instead of phone GPS.
  // Identity is worker id + PIN. Repeated wrong PINs lock that worker at that kiosk for a few minutes.
  const fails = new Map();
  app.get('/kiosk/info', async (req, reply) => {
    const k = await db.one('kiosks', { token: req.headers['x-kiosk-token'] ?? '', active: 1 });
    const site = k && await db.one('sites', { id: k.site_id });
    return k && site ? { name: k.name, site: site.name } : reply.code(401).send({ error: 'invalid_kiosk' });
  });
  app.post('/kiosk/punch', async (req, reply) => {
    const k = await db.one('kiosks', { token: req.headers['x-kiosk-token'] ?? '', active: 1 });
    if (!k) return reply.code(401).send({ error: 'invalid_kiosk' });
    const { worker_id, pin } = req.body ?? {};
    const key = `${k.id}:${worker_id}`;
    const f = fails.get(key);
    if (f && f.n >= FAIL_LIMIT && Date.now() - f.ts < LOCK_MS) return reply.code(429).send({ error: 'too_many_attempts' });
    const u = await db.one('users', { id: Number(worker_id) || 0, org_id: k.org_id, role: 'worker', active: 1 });
    if (!u || !u.pin_hash || !bcrypt.compareSync(String(pin ?? ''), u.pin_hash)) {
      fails.set(key, { n: (f && Date.now() - f.ts < LOCK_MS ? f.n : 0) + 1, ts: Date.now() });
      await audit(k.org_id, null, 'kiosk_bad_pin', { kiosk: k.id, worker_id });
      return reply.code(401).send({ error: 'bad_id_or_pin' });
    }
    fails.delete(key);
    if (u.site_id !== k.site_id) return reply.code(403).send({ error: 'wrong_site' });
    const site = await db.one('sites', { id: k.site_id });
    const pos = centre(site);
    const tz = await tzOf(u.org_id);
    const now = Date.now();
    const last = await db.last('punches', { user_id: u.id });
    const kind = last?.kind === 'in' ? 'out' : 'in';
    const day = dayKey(now, tz);
    const first = (await db.find('punches', { user_id: u.id, kind: 'in' }, { projection: { server_ts: 1 } })).filter((p) => dayKey(p.server_ts, tz) === day).length === 0;
    const status = kind === 'in' && first ? attendanceStatus({ start: u.shift_start, grace_min: u.grace_min }, new Date(now), tz) : null;
    await db.insert('punches', {
      org_id: u.org_id, user_id: u.id, site_id: site.id, kind, server_ts: now, device_ts: now, lat: pos.lat, lng: pos.lng, accuracy: 0,
      device_id: `kiosk:${k.id}`, mock: 0, inside: 1, risk_score: 0, risk_level: 'low', risk_reasons: [], status, offline: 0, review: 'auto', source: 'kiosk',
    });
    return { name: u.name, kind, status, at: new Date(now).toISOString() };
  });
}
