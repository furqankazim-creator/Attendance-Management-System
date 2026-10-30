// Copy an existing SQLite file into MongoDB (Atlas or local). Run once against an empty database:  npm run migrate:sqlite
import { openDb } from '../src/db.js';
import { resolveMongo } from '../src/connect.js';
import { migrateSqlite } from '../src/migrate.js';

const mongo = await resolveMongo();
const db = await openDb(mongo.uri, process.env.MONGODB_DB ?? 'geowork');
try { console.log(await migrateSqlite(db, process.env.SQLITE_FILE ?? 'attendance.db')); }
catch (e) { console.error(e.message); process.exitCode = 1; }
await db.close();
await mongo.stop();
