import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const API_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Returns { uri, local, stop }. With MONGODB_URI set (Atlas or any server) it is used as is. Without it, a MongoDB is started
 * on this machine: the installed MongoDB service if there is one, else an embedded copy with its files in apps/api/.data/mongo.
 * Local mode is for development only.
 */
export async function resolveMongo() {
  if (process.env.MONGODB_URI) return { uri: process.env.MONGODB_URI, local: false, stop: async () => {} };
  // A MongoDB already installed on this machine (the Windows service listens on 27017) is the simplest local option.
  const localUri = 'mongodb://127.0.0.1:27017';
  const probe = new MongoClient(localUri, { serverSelectionTimeoutMS: 1500 });
  try { await probe.connect(); await probe.close(); return { uri: localUri, local: true, stop: async () => {} }; } catch { await probe.close().catch(() => {}); }
  let MongoMemoryServer;
  try { ({ MongoMemoryServer } = await import('mongodb-memory-server')); }
  catch { throw new Error('MONGODB_URI is not set. Put your Atlas connection string in apps/api/.env (see .env.example).'); }
  const dbPath = path.join(API_ROOT, '.data', 'mongo');
  fs.mkdirSync(dbPath, { recursive: true });
  const server = await MongoMemoryServer.create({ instance: { dbPath, port: 27018, args: ['--wiredTigerCacheSizeGB', '0.25'] }, auth: { disable: true } });
  return { uri: server.getUri(), local: true, stop: () => server.stop({ doCleanup: false, force: true }) };
}
