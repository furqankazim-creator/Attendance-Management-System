import { MongoClient } from 'mongodb';

// Collections keep the numeric `id` the apps already use (separate from Mongo's _id), allocated from a counters collection.
// Field names match the old SQL columns, so API responses are unchanged.
const INDEXES = {
  orgs: [[{ id: 1 }, { unique: true }]],
  users: [[{ id: 1 }, { unique: true }], [{ email: 1 }, { unique: true }], [{ org_id: 1, role: 1 }]],
  sites: [[{ id: 1 }, { unique: true }], [{ org_id: 1 }]],
  punches: [[{ id: 1 }, { unique: true }], [{ user_id: 1, id: -1 }], [{ org_id: 1, server_ts: -1 }], [{ org_id: 1, review: 1 }]],
  corrections: [[{ id: 1 }, { unique: true }], [{ org_id: 1, state: 1 }]],
  leaves: [[{ id: 1 }, { unique: true }], [{ org_id: 1, state: 1 }], [{ user_id: 1 }]],
  breaks: [[{ id: 1 }, { unique: true }], [{ user_id: 1 }]],
  timesheets: [[{ id: 1 }, { unique: true }], [{ user_id: 1, week_start: 1 }, { unique: true }]],
  kiosks: [[{ id: 1 }, { unique: true }], [{ token: 1 }, { unique: true }]],
  audit: [[{ id: 1 }, { unique: true }], [{ org_id: 1, id: -1 }]],
  alerts: [[{ id: 1 }, { unique: true }], [{ org_id: 1, id: -1 }], [{ user_id: 1, to_worker: 1, id: -1 }], [{ key: 1 }]],
};

export async function openDb(uri, dbName = 'geowork') {
  if (!uri) throw new Error('MONGODB_URI is not set');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const d = client.db(dbName);
  const c = (name) => d.collection(name);
  for (const [name, list] of Object.entries(INDEXES)) for (const [keys, opts] of list) await c(name).createIndex(keys, opts);

  const nextId = async (name) => (await c('counters').findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })).seq;
  const proj = (o = {}) => ({ projection: { _id: 0, ...(o.projection ?? {}) }, ...(o.sort ? { sort: o.sort } : {}), ...(o.limit ? { limit: o.limit } : {}) });

  return {
    client, d, c, nextId,
    /** All matching documents. opts: { sort, limit, projection } */
    find: (name, filter = {}, opts) => c(name).find(filter, proj(opts)).toArray(),
    one: (name, filter, opts) => c(name).findOne(filter, proj(opts)),
    /** Newest document (highest id) matching the filter. */
    last: async (name, filter, opts) => (await c(name).find(filter, proj({ ...opts, sort: { id: -1 }, limit: 1 })).toArray())[0] ?? null,
    insert: async (name, doc) => { const id = await nextId(name); await c(name).insertOne({ id, ...doc }); return id; },
    /** Sets fields on the first match; returns how many documents matched (0 or 1). */
    update: async (name, filter, set) => (await c(name).updateOne(filter, { $set: set })).matchedCount,
    updateMany: async (name, filter, set) => (await c(name).updateMany(filter, { $set: set })).matchedCount,
    remove: async (name, filter) => (await c(name).deleteOne(filter)).deletedCount,
    count: (name, filter = {}) => c(name).countDocuments(filter),
    close: () => client.close(),
  };
}

export const newUser = (f) => ({
  site_id: null, shift_start: '09:00', shift_end: '18:00', grace_min: 10, device_id: null, active: 1,
  pin_hash: null, created_ts: Date.now(), department: 'General', ...f,
});
