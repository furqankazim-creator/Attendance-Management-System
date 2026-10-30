import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const json = (v, fallback) => { try { return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const TABLES = {
  orgs: (r) => r,
  users: (r) => ({ ...r, site_id: r.site_id ?? null, device_id: r.device_id ?? null, pin_hash: r.pin_hash ?? null }),
  sites: (r) => ({ ...r, points: json(r.points, null) }),
  punches: (r) => ({ ...r, risk_reasons: json(r.risk_reasons, []) }),
  corrections: (r) => r,
  leaves: (r) => r,
  breaks: (r) => r,
  timesheets: (r) => r,
  kiosks: (r) => r,
  audit: (r) => r,
};

/** Copies an old SQLite file into an empty MongoDB database, keeping every numeric id. Returns { table: rowCount }. */
export async function migrateSqlite(db, file) {
  if (!fs.existsSync(file)) throw new Error(`${file} not found`);
  if (await db.count('users')) throw new Error('the MongoDB database already has data');
  const sqlite = new DatabaseSync(file, { readOnly: true });
  const done = {};
  for (const [name, map] of Object.entries(TABLES)) {
    let rows = [];
    try { rows = sqlite.prepare(`select * from ${name}`).all(); } catch { continue; }
    if (rows.length) await db.c(name).insertMany(rows.map(map));
    await db.c('counters').updateOne({ _id: name }, { $set: { seq: rows.reduce((m, r) => Math.max(m, r.id), 0) } }, { upsert: true });
    done[name] = rows.length;
  }
  sqlite.close();
  return done;
}
