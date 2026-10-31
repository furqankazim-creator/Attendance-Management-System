import path from 'node:path';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { resolveMongo } from './connect.js';
import { migrateSqlite } from './migrate.js';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me' || process.env.JWT_SECRET.length < 24)) {
  console.error('Refusing to start: set JWT_SECRET to a long random string (24+ characters) in production.');
  process.exit(1);
}
const dbName = process.env.MONGODB_DB ?? 'geowork';
const mongo = await resolveMongo().catch((e) => { console.error(e.message); process.exit(1); });

if (mongo.local) {
  console.log(`MONGODB_URI is not set: using the MongoDB on this PC (${mongo.uri}). Set MONGODB_URI in .env to use Atlas.`);
  // First run only: bring the old demo data across if it exists and the database is empty.
  const db = await openDb(mongo.uri, dbName);
  if (!(await db.count('users'))) {
    try { console.log('Imported demo data from attendance.db:', await migrateSqlite(db, 'attendance.db')); } catch (e) { console.log('No demo data imported:', e.message); }
  }
  await db.close();
}

const app = await buildApp({ mongoUri: mongo.uri, dbName, secret: process.env.JWT_SECRET });
const addr = await app.listen({ port: Number(process.env.PORT ?? 3100), host: '0.0.0.0' });
console.log('API on', addr);
// Duty monitor: "away too long" alerts and automatic closing of days nobody checked out of. Runs once a minute.
const dutyTimer = setInterval(() => app.runDuty().catch((e) => console.error('duty run failed:', e.message)), 60000);
dutyTimer.unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); await mongo.stop(); process.exit(0); });
