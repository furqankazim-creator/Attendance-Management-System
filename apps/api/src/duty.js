// On-duty monitoring: alerts when an employee leaves the work area during a shift, and automatic closing of days that
// were never checked out. Alerts are plain rows in the `alerts` collection; the admin panel and the apps just list them.

const MIN = 60000;
const DAY = 86400000;
const hh = (s) => { const [h, m] = String(s ?? '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fmtMin = (n) => { const m = Math.max(0, Math.round(n)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };

export const SITE_DEFAULTS = { auto_close: 1, auto_close_after_min: 60, away_alert_min: 20 };

/** Validates the duty settings of a site body. Returns { ok, set } where `set` only holds the fields that were sent. */
export function dutySettings(b = {}) {
  const set = {};
  if ('auto_close' in b) set.auto_close = b.auto_close ? 1 : 0;
  if ('auto_close_after_min' in b) {
    const n = Number(b.auto_close_after_min);
    if (!Number.isInteger(n) || n < 0 || n > 480) return { ok: false, error: 'auto_close_after_min_0_to_480' };
    set.auto_close_after_min = n;
  }
  if ('away_alert_min' in b) {
    const n = Number(b.away_alert_min);
    if (!Number.isInteger(n) || n < 5 || n > 240) return { ok: false, error: 'away_alert_min_5_to_240' };
    set.away_alert_min = n;
  }
  return { ok: true, set };
}

export function makeDuty({ db, tzOf, dayKey }) {
  const localClock = (ts, tz) => new Date(ts + tz * MIN).toISOString().slice(11, 16);
  const minutesOf = (ts, tz) => Math.floor((((ts + tz * MIN) % DAY) + DAY) % DAY / MIN);

  /** Absolute time (ms) the shift that contains `ts` ends. Handles shifts that run past midnight. */
  function shiftEndAt(u, ts, tz) {
    const s = hh(u.shift_start ?? '09:00');
    const e = hh(u.shift_end ?? '18:00');
    const overnight = e <= s;
    let start = Date.parse(dayKey(ts, tz) + 'T00:00:00Z') - tz * MIN;
    if (overnight && minutesOf(ts, tz) < e) start -= DAY; // after midnight: still the previous day's shift
    return start + (overnight ? e + 1440 : e) * MIN;
  }

  async function addAlert(a) {
    if (a.key && (await db.one('alerts', { key: a.key }, { projection: { id: 1 } }))) return null;
    return db.insert('alerts', { seen: 0, to_worker: 0, worker_text: null, ...a });
  }

  /** Called after every stored punch. Never throws: alerts must not break a punch. */
  async function onPunch({ u, site, tz, ts, kind, leftArea, source, outside, prev, punchId }) {
    try {
      const base = { org_id: u.org_id, user_id: u.id, site_id: site?.id ?? null, ts };
      const where = site?.name ?? 'the work area';
      if (leftArea) {
        const left = Math.round((shiftEndAt(u, ts, tz) - ts) / MIN);
        const when = `at ${localClock(ts, tz)}${left > 0 ? `, ${fmtMin(left)} before shift end` : ''}`;
        await addAlert({
          ...base, type: 'left_area', tone: 'warn', key: `left:${punchId}`,
          text: outside ? `${u.name} checked out from outside ${where} ${when}` : `${u.name} left ${where} ${when}`,
        });
      }
      if (kind === 'in' && prev?.kind === 'out' && prev.left_area && ts - prev.server_ts < 12 * 60 * MIN) {
        await addAlert({
          ...base, type: 'returned', tone: 'info', key: `back:${punchId}`,
          text: `${u.name} is back at ${where} after ${fmtMin((ts - prev.server_ts) / MIN)} away`,
        });
      }
    } catch (e) { console.error('duty alert failed:', e.message); }
  }

  /** Periodic pass: raise "away too long" alerts and close days that were never checked out. Safe to run any time, repeatedly. */
  async function run(now = Date.now()) {
    const out = { away: 0, closed: 0 };
    const tzs = {};
    const sites = {};
    const workers = await db.find('users', { role: 'worker', active: 1, site_id: { $ne: null } });
    for (const u of workers) {
      const last = await db.last('punches', { user_id: u.id, review: { $ne: 'rejected' } });
      if (!last) continue;
      const tz = (tzs[u.org_id] ??= await tzOf(u.org_id));
      const site = (sites[u.site_id] ??= await db.one('sites', { id: u.site_id }));
      if (!site) continue;
      const cfg = { ...SITE_DEFAULTS, ...Object.fromEntries(Object.entries(site).filter(([k]) => k in SITE_DEFAULTS && site[k] != null)) };

      if (last.kind === 'out' && last.left_area) {
        const endAbs = shiftEndAt(u, last.server_ts, tz);
        const gone = now - last.server_ts;
        if (gone >= cfg.away_alert_min * MIN && now < endAbs) {
          const id = await addAlert({
            org_id: u.org_id, user_id: u.id, site_id: site.id, ts: now, type: 'away_long', tone: 'bad', key: `away:${last.id}`, to_worker: 1,
            text: `${u.name} has been away from ${site.name} for ${fmtMin(gone / MIN)} (left ${localClock(last.server_ts, tz)}, shift ends ${localClock(endAbs, tz)})`,
            worker_text: `You have been outside the work area for ${fmtMin(gone / MIN)} during your shift. Return to the site or tell your supervisor.`,
          });
          if (id) out.away++;
        }
      }

      if (last.kind === 'in' && cfg.auto_close) {
        const closeAt = Math.max(shiftEndAt(u, last.server_ts, tz), last.server_ts);
        if (now >= closeAt + cfg.auto_close_after_min * MIN) {
          const id = await db.insert('punches', {
            org_id: u.org_id, user_id: u.id, site_id: site.id, kind: 'out', server_ts: closeAt, device_ts: null, lat: last.lat, lng: last.lng,
            accuracy: null, device_id: null, mock: 0, inside: 1, risk_score: 0, risk_level: 'low', risk_reasons: ['auto_closed'], status: null,
            offline: 0, review: 'auto', source: 'auto_close', left_area: 0,
          });
          const brk = await db.one('breaks', { user_id: u.id, end_ts: null });
          if (brk) await db.update('breaks', { user_id: u.id, end_ts: null }, { end_ts: Math.max(brk.start_ts, Math.min(closeAt, now)) });
          await db.insert('audit', { org_id: u.org_id, actor_id: u.id, action: 'auto_closed', detail: JSON.stringify({ punch: id, at: closeAt }), ts: now });
          await addAlert({
            org_id: u.org_id, user_id: u.id, site_id: site.id, ts: now, type: 'auto_closed', tone: 'warn', key: `close:${last.id}`, to_worker: 1,
            text: `${u.name} did not check out: the day was closed automatically at ${localClock(closeAt, tz)}`,
            worker_text: `You did not check out, so the system closed your day at ${localClock(closeAt, tz)}. If you worked later, send a time correction in Reports.`,
          });
          out.closed++;
        }
      }
    }
    return out;
  }

  return { onPunch, run, shiftEndAt, fmtMin };
}

export function registerDuty(app, { db, guard, visible, seen }) {
  const WEEK = 7 * DAY;
  const row = (a, names, worker) => ({
    id: a.id, type: a.type, tone: a.tone, text: worker ? (a.worker_text ?? a.text) : a.text, name: names?.[a.user_id], user_id: a.user_id,
    at: new Date(a.ts).toISOString(), seen: !!a.seen,
  });
  const mineOf = (req) => db.find('alerts', { user_id: req.user.id, to_worker: 1, ts: { $gte: Date.now() - WEEK } }, { sort: { id: -1 }, limit: 30 });
  const visibleAlerts = async (req) => {
    const vis = await visible(req);
    return (await db.find('alerts', { org_id: req.user.org_id, ts: { $gte: Date.now() - WEEK } }, { sort: { id: -1 }, limit: 200 })).filter((a) => seen(vis, a.user_id));
  };

  app.get('/alerts', { preHandler: guard('board.read') }, async (req) => {
    const names = Object.fromEntries((await db.find('users', { org_id: req.user.org_id }, { projection: { id: 1, name: 1 } })).map((u) => [u.id, u.name]));
    const list = await visibleAlerts(req);
    return { items: list.slice(0, 50).map((a) => row(a, names, false)), unseen: list.filter((a) => !a.seen).length };
  });
  app.post('/alerts/seen', { preHandler: guard('approve.write') }, async (req) => {
    const want = Array.isArray(req.body?.ids) ? new Set(req.body.ids.map(Number)) : null;
    const ids = (await visibleAlerts(req)).filter((a) => !a.seen && (!want || want.has(a.id))).map((a) => a.id);
    if (ids.length) await db.updateMany('alerts', { org_id: req.user.org_id, id: { $in: ids } }, { seen: 1 });
    return { ok: true, marked: ids.length };
  });

  app.get('/me/alerts', { preHandler: guard('') }, async (req) => {
    const list = await mineOf(req);
    return { items: list.map((a) => row(a, null, true)), unseen: list.filter((a) => !a.seen).length };
  });
  app.post('/me/alerts/seen', { preHandler: guard('') }, async (req) => {
    await db.updateMany('alerts', { user_id: req.user.id, to_worker: 1, seen: 0 }, { seen: 1 });
    return { ok: true };
  });
}
