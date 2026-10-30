// Breaks, per-day stats, employee timeline/history, and the dashboard overview used by the redesigned screens.

const MS_DAY = 86400000;
const dow = (day) => new Date(day + 'T00:00:00Z').getUTCDay(); // 0 Sun .. 6 Sat
const isWeekday = (day) => dow(day) >= 1 && dow(day) <= 5;
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * MS_DAY).toISOString().slice(0, 10);
const minutesOfDay = (ts, tz) => Math.floor((((ts + tz * 60000) % MS_DAY) + MS_DAY) % MS_DAY / 60000);
const hhmm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/** Per-day facts for one worker from already-loaded punches (ordered by time) and breaks. Worked time excludes breaks. */
export function dayStatsFrom(ps, brs, tz, dayKey) {
  const days = {};
  const get = (k) => (days[k] ??= { day: k, first_in: null, last_out: null, gross: 0, break_ms: 0, status: null, open_since: null, break_open: null });
  let open = null;
  for (const p of ps) {
    const k = dayKey(p.server_ts, tz);
    if (p.kind === 'in') {
      const x = get(k);
      x.first_in ??= p.server_ts;
      x.status ??= p.status;
      x.open_since = p.server_ts;
      open = { ts: p.server_ts, key: k };
    } else if (open) {
      const o = get(open.key);
      o.gross += p.server_ts - open.ts;
      o.last_out = p.server_ts;
      o.open_since = null;
      open = null;
    }
  }
  for (const b of brs) {
    const x = get(dayKey(b.start_ts, tz));
    if (b.end_ts) x.break_ms += b.end_ts - b.start_ts; // completed breaks only; an open break is reported via break_open
    else x.break_open = b.start_ts;
  }
  for (const x of Object.values(days)) x.ms = Math.max(0, x.gross - x.break_ms); // completed time only; open shifts add live time on the client
  return days;
}

export async function dayStats(db, userId, tz, dayKey) {
  const ps = await db.find('punches', { user_id: userId, review: { $ne: 'rejected' } }, { sort: { server_ts: 1, id: 1 }, projection: { kind: 1, server_ts: 1, status: 1 } });
  const brs = await db.find('breaks', { user_id: userId });
  return dayStatsFrom(ps, brs, tz, dayKey);
}

/** First day an employee can be marked absent: the day they were created, else the day of their first punch. */
export function joinedDay(createdTs, days, tz, dayKey) {
  if (createdTs > 0) return dayKey(createdTs, tz);
  return Object.keys(days).sort()[0] ?? '9999-12-31';
}

export function registerExtras2(app, { db, guard, visible, seen, tzOf, dayKey, nameMap }) {
  const leaveDays = (userId) => db.find('leaves', { user_id: userId, state: 'approved' }, { projection: { from_day: 1, to_day: 1 } });
  const onLeave = (ls, day) => ls.some((l) => l.from_day <= day && day <= l.to_day);

  // ---------- breaks
  app.post('/break/start', { preHandler: guard('') }, async (req, reply) => {
    if (req.user.role !== 'worker') return reply.code(403).send({ error: 'workers_only' });
    const last = await db.last('punches', { user_id: req.user.id });
    if (last?.kind !== 'in') return reply.code(409).send({ error: 'not_checked_in' });
    if (await db.one('breaks', { user_id: req.user.id, end_ts: null })) return reply.code(409).send({ error: 'break_already_open' });
    await db.insert('breaks', { org_id: req.user.org_id, user_id: req.user.id, start_ts: Date.now(), end_ts: null });
    return { ok: true };
  });
  app.post('/break/end', { preHandler: guard('') }, async (req, reply) => {
    if (!(await db.update('breaks', { user_id: req.user.id, end_ts: null }, { end_ts: Date.now() }))) return reply.code(409).send({ error: 'no_open_break' });
    return { ok: true };
  });

  // ---------- worker home data
  const statusOf = (days, leaves, today, day, joined = '0000-00-00') => {
    const x = days[day];
    if (x?.first_in) return x.status ?? 'present';
    if (onLeave(leaves, day)) return 'leave';
    if (day < today && isWeekday(day) && day >= joined) return 'absent';
    if (!isWeekday(day)) return 'off';
    return null;
  };

  app.get('/me/today', { preHandler: guard('') }, async (req) => {
    const tz = await tzOf(req.user.org_id);
    const now = Date.now();
    const today = dayKey(now, tz);
    const days = await dayStats(db, req.user.id, tz, dayKey);
    const leaves = await leaveDays(req.user.id);
    const joined = joinedDay((await db.one('users', { id: req.user.id }, { projection: { created_ts: 1 } })).created_ts, days, tz, dayKey);
    const t = days[today] ?? {};
    const lastP = await db.last('punches', { user_id: req.user.id });
    const monday = addDays(today, -((dow(today) + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      return { day: d, status: statusOf(days, leaves, today, d, joined), first_in: days[d]?.first_in ? new Date(days[d].first_in).toISOString() : null };
    });
    const month = { present: 0, late: 0, absent: 0, ms: 0 };
    for (let d = today.slice(0, 8) + '01'; d <= today; d = addDays(d, 1)) {
      const st = statusOf(days, leaves, today, d, joined);
      if (st === 'present') month.present++;
      else if (st === 'late') { month.present++; month.late++; }
      else if (st === 'absent') month.absent++;
      month.ms += days[d]?.ms ?? 0;
    }
    const recent = (await db.find('punches', { user_id: req.user.id, review: { $ne: 'rejected' } }, { sort: { id: -1 }, limit: 6, projection: { kind: 1, server_ts: 1 } }))
      .map((p) => ({ type: p.kind === 'in' ? 'check_in' : 'check_out', at: new Date(p.server_ts).toISOString() }));
    const brk = (await db.find('breaks', { user_id: req.user.id }, { sort: { id: -1 }, limit: 4 }))
      .flatMap((b) => [{ type: 'break_start', at: new Date(b.start_ts).toISOString() }, ...(b.end_ts ? [{ type: 'break_end', at: new Date(b.end_ts).toISOString() }] : [])]);
    return {
      today, checked_in: lastP?.kind === 'in', first_in: t.first_in ? new Date(t.first_in).toISOString() : null, last_out: t.last_out ? new Date(t.last_out).toISOString() : null,
      status: t.status ?? null, worked_ms: t.ms ?? 0, gross_ms: t.gross ?? 0, break_ms: t.break_ms ?? 0, open_since: t.open_since ?? null, break_open_since: t.break_open ?? null,
      week, month, recent: [...recent, ...brk].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
    };
  });

  app.get('/me/history', { preHandler: guard('') }, async (req, reply) => {
    const month = req.query.month;
    if (!/^\d{4}-\d{2}$/.test(month ?? '')) return reply.code(400).send({ error: 'bad_month' });
    const tz = await tzOf(req.user.org_id);
    const today = dayKey(Date.now(), tz);
    const days = await dayStats(db, req.user.id, tz, dayKey);
    const leaves = await leaveDays(req.user.id);
    const joined = joinedDay((await db.one('users', { id: req.user.id }, { projection: { created_ts: 1 } })).created_ts, days, tz, dayKey);
    const out = [];
    const totals = { present: 0, late: 0, absent: 0, ms: 0 };
    for (let d = month + '-01'; d.slice(0, 7) === month; d = addDays(d, 1)) {
      const st = d > today ? null : statusOf(days, leaves, today, d, joined);
      const x = days[d];
      if (st === 'present') totals.present++;
      if (st === 'late') { totals.present++; totals.late++; }
      if (st === 'absent') totals.absent++;
      totals.ms += x?.ms ?? 0;
      out.push({ day: d, status: st, first_in: x?.first_in ? new Date(x.first_in).toISOString() : null, last_out: x?.last_out ? new Date(x.last_out).toISOString() : null, ms: x?.ms ?? 0 });
    }
    return { month, days: out, totals };
  });

  app.get('/me/day', { preHandler: guard('') }, async (req, reply) => {
    const day = req.query.day;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return reply.code(400).send({ error: 'bad_day' });
    const tz = await tzOf(req.user.org_id);
    const days = await dayStats(db, req.user.id, tz, dayKey);
    const events = [];
    const sites = Object.fromEntries((await db.find('sites', { org_id: req.user.org_id }, { projection: { id: 1, name: 1 } })).map((x) => [x.id, x.name]));
    for (const p of await db.find('punches', { user_id: req.user.id, review: { $ne: 'rejected' } })) {
      if (dayKey(p.server_ts, tz) === day) events.push({ type: p.kind === 'in' ? 'check_in' : 'check_out', at: p.server_ts, place: sites[p.site_id] ?? null, status: p.status, pending: p.review === 'pending' });
    }
    for (const b of await db.find('breaks', { user_id: req.user.id })) {
      if (dayKey(b.start_ts, tz) !== day) continue;
      events.push({ type: 'break_start', at: b.start_ts });
      if (b.end_ts) events.push({ type: 'break_end', at: b.end_ts, duration_ms: b.end_ts - b.start_ts });
    }
    events.sort((a, b) => a.at - b.at);
    const x = days[day];
    return { day, total_ms: x?.ms ?? 0, break_ms: x?.break_ms ?? 0, open: !!x?.open_since, events: events.map((e) => ({ ...e, at: new Date(e.at).toISOString() })) };
  });

  // ---------- admin dashboard overview
  app.get('/dashboard', { preHandler: guard('board.read') }, async (req) => {
    const tz = await tzOf(req.user.org_id);
    const now = Date.now();
    const today = dayKey(now, tz);
    const vis = await visible(req);
    const workers = (await db.find('users', { org_id: req.user.org_id, role: 'worker', active: 1 }, { projection: { id: 1, name: 1, department: 1, shift_start: 1, shift_end: 1, grace_min: 1, created_ts: 1 } }))
      .filter((w) => seen(vis, w.id));
    // load once for the whole organisation instead of once per employee
    const since = now - 45 * MS_DAY;
    const allPunches = await db.find('punches', { org_id: req.user.org_id, server_ts: { $gte: since }, review: { $ne: 'rejected' } }, { sort: { server_ts: 1, id: 1 }, projection: { user_id: 1, kind: 1, server_ts: 1, status: 1 } });
    const allBreaks = await db.find('breaks', { org_id: req.user.org_id, start_ts: { $gte: since } });
    const allLeaves = await db.find('leaves', { org_id: req.user.org_id, state: 'approved' }, { projection: { user_id: 1, from_day: 1, to_day: 1 } });
    const nowMin = minutesOfDay(now, tz);
    const overview = { total: workers.length, present: 0, absent: 0, leave: 0, late: 0, early: 0, expected: 0, avg_ms: 0 };
    const depts = {};
    const trend = [];
    for (let i = 29; i >= 0; i--) trend.push({ day: addDays(today, -i), present: 0, late: 0, absent: 0, any: false });
    let hoursSum = 0, hoursN = 0;
    const recentLate = new Set();
    for (const w of workers) {
      const days = dayStatsFrom(allPunches.filter((p) => p.user_id === w.id), allBreaks.filter((b) => b.user_id === w.id), tz, dayKey);
      const leaves = allLeaves.filter((l) => l.user_id === w.id);
      const joined = joinedDay(w.created_ts, days, tz, dayKey);
      const x = days[today];
      const dep = (depts[w.department || 'General'] ??= { department: w.department || 'General', total: 0, present: 0, absent: 0, leave: 0, late: 0, early: 0, ms: 0, n: 0 });
      dep.total++;
      let state;
      if (x?.first_in) state = x.status === 'late' ? 'late' : 'present';
      else if (onLeave(leaves, today)) state = 'leave';
      else state = nowMin > hhmm(w.shift_start) + w.grace_min ? 'absent' : 'expected';
      if (state === 'present' || state === 'late') { overview.present++; dep.present++; }
      if (state === 'late') { overview.late++; dep.late++; }
      if (state === 'absent') { overview.absent++; dep.absent++; }
      if (state === 'leave') { overview.leave++; dep.leave++; }
      if (state === 'expected') overview.expected++;
      if (x?.last_out && !x.open_since && minutesOfDay(x.last_out, tz) < hhmm(w.shift_end || '18:00')) { overview.early++; dep.early++; }
      if (x?.first_in) {
        const live = Math.max(0, x.gross + (x.open_since ? now - x.open_since : 0) - x.break_ms - (x.break_open ? now - x.break_open : 0));
        hoursSum += live; hoursN++; dep.ms += live; dep.n++;
      }
      for (const t of trend) {
        const d = days[t.day];
        if (d?.first_in) { t.any = true; if (d.status === 'late') t.late++; else t.present++; }
        else if (isWeekday(t.day) && t.day < today && t.day >= joined && !onLeave(leaves, t.day)) t.absent++;
      }
      for (let k = 0; k < 3; k++) if (days[addDays(today, -k)]?.status === 'late') recentLate.add(w.name);
    }
    overview.avg_ms = hoursN ? Math.round(hoursSum / hoursN) : 0;
    const departments = Object.values(depts).map(({ n, ms, ...d }) => ({ ...d, avg_ms: n ? Math.round(ms / n) : 0 }));
    const names = await nameMap(req.user.org_id);
    const feedRows = await db.find('punches', { org_id: req.user.org_id, server_ts: { $gt: now - 2 * MS_DAY } }, { sort: { id: -1 }, limit: 40 });
    const feed = feedRows.filter((p) => seen(vis, p.user_id)).slice(0, 12).map((p) => {
      const name = names[p.user_id];
      const time = new Date(p.server_ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      const reasons = p.risk_reasons ?? [];
      let text, tone = 'ok';
      if (p.kind === 'in' && p.status === 'late') { text = `${name} is late today`; tone = 'warn'; }
      else if (reasons.includes('unregistered_device')) { text = `${name} checked ${p.kind} from a different device`; tone = 'info'; }
      else if (reasons.includes('mock_location')) { text = `${name} used a mock location`; tone = 'bad'; }
      else text = `${name} checked ${p.kind}${p.source === 'kiosk' ? ' at the kiosk' : p.source === 'auto' ? ' automatically' : ''}`;
      return { text, tone, at: new Date(p.server_ts).toISOString(), time };
    });
    const pendingLeave = (await db.find('leaves', { org_id: req.user.org_id, state: 'pending' }, { projection: { user_id: 1 } })).filter((l) => seen(vis, l.user_id)).length;
    const shifts = {};
    workers.forEach((w) => { const k = `${w.shift_start} - ${w.shift_end || '18:00'}`; shifts[k] = (shifts[k] ?? 0) + 1; });
    const nextShift = Object.entries(shifts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { today, overview, departments, trend: trend.filter((t) => isWeekday(t.day) || t.any).map(({ any, ...t }) => t), feed, alerts: { pendingLeave, recentLate: [...recentLate], early: overview.early, nextShift } };
  });
}
