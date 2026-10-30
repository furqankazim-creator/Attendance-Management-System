import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

// Keep the test database on the project drive: the system temp drive can be too small for MongoDB's journal.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.mongo-test');

// One throwaway MongoDB per test file; every app gets its own empty database inside it.
let server;
let mine;
const apps = [];
let n = 0;

export async function newApp(opts = {}) {
  if (!server) {
    const dbPath = (mine = path.join(ROOT, `${process.pid}-${Date.now()}`));
    fs.mkdirSync(dbPath, { recursive: true });
    server = await MongoMemoryServer.create({ instance: { dbPath, args: ['--wiredTigerCacheSizeGB', '0.25'] } });
  }
  const app = await buildApp({ mongoUri: server.getUri(), dbName: `t${Date.now()}_${n++}`, ...opts });
  apps.push(app);
  return app;
}

export async function stopAll() {
  await Promise.all(apps.map((a) => a.close()));
  await server?.stop({ doCleanup: true, force: true });
  if (mine) fs.rmSync(mine, { recursive: true, force: true });
}
