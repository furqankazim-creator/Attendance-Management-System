import test from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { newApp, stopAll } from './helper.js';
after(stopAll);

async function setup() {
  const app = await newApp();
  const call = async (method, url, payload, token) => {
    const r = await app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
    const isJson = (r.headers['content-type'] ?? '').includes('json');
    return { code: r.statusCode, body: isJson ? r.json() : r.body };
  };
  const reg = await call('POST', '/auth/register-org', { orgName: 'Acme', name: 'Boss', email: 'a@x.com', password: 'pw' });
  const admin = reg.body.token;
  const site = await call('POST', '/sites', { name: 'HQ', type: 'circle', lat: 24.8607, lng: 67.0011, radius_m: 100 }, admin);
  // shift starts 00:00 with a 23h59 grace so the status is always "present" regardless of test time
  await call('POST', '/workers', { name: 'Ali', email: 'ali@x.com', password: 'pw', site_id: site.body.id, shift_start: '00:00', grace_min: 1439 }, admin);
  const login = await call('POST', '/auth/login', { email: 'ali@x.com', password: 'pw', device_id: 'dev1' });
  return { call, admin, worker: login.body.token };
}
const inside = { lat: 24.8607, lng: 67.0011, accuracy: 8, device_id: 'dev1' };

test('check-in inside fence works and is present', async () => {
  const { call, worker } = await setup();
  const r = await call('POST', '/punch', { kind: 'in', ...inside }, worker);
  assert.equal(r.code, 200);
  assert.equal(r.body.status, 'present');
  assert.equal(r.body.risk.level, 'low');
});
test('outside fence rejected', async () => {
  const { call, worker } = await setup();
  const r = await call('POST', '/punch', { kind: 'in', lat: 25.5, lng: 67.5, accuracy: 8, device_id: 'dev1' }, worker);
  assert.equal(r.code, 403);
  assert.equal(r.body.error, 'outside_fence');
});
test('mock location rejected', async () => {
  const { call, worker } = await setup();
  assert.equal((await call('POST', '/punch', { kind: 'in', ...inside, mock: true }, worker)).code, 403);
});
test('poor accuracy rejected online', async () => {
  const { call, worker } = await setup();
  assert.equal((await call('POST', '/punch', { kind: 'in', ...inside, accuracy: 200 }, worker)).code, 422);
});
test('double check-in and out-before-in blocked', async () => {
  const { call, worker } = await setup();
  assert.equal((await call('POST', '/punch', { kind: 'out', ...inside }, worker)).code, 409);
  await call('POST', '/punch', { kind: 'in', ...inside }, worker);
  assert.equal((await call('POST', '/punch', { kind: 'in', ...inside }, worker)).code, 409);
  assert.equal((await call('POST', '/punch', { kind: 'out', ...inside }, worker)).code, 200);
});
test('different device raises risk', async () => {
  const { call, worker } = await setup();
  const r = await call('POST', '/punch', { kind: 'in', ...inside, device_id: 'other' }, worker);
  assert.equal(r.body.risk.level, 'medium');
  assert.ok(r.body.risk.reasons.includes('unregistered_device'));
});
test('worker blocked from admin routes; admin sees board and csv', async () => {
  const { call, admin, worker } = await setup();
  assert.equal((await call('GET', '/board', null, worker)).code, 403);
  await call('POST', '/punch', { kind: 'in', ...inside }, worker);
  const board = await call('GET', '/board', null, admin);
  assert.equal(board.body[0].state, 'in');
  const csv = await call('GET', '/reports/attendance?format=csv', null, admin);
  assert.match(csv.body, /Ali/);
});
test('correction workflow', async () => {
  const { call, admin, worker } = await setup();
  const c = await call('POST', '/corrections', { day: '2026-10-01', kind: 'out', requested_time: '17:00', reason: 'forgot' }, worker);
  const d = await call('POST', `/corrections/${c.body.id}/decision`, { decision: 'approved' }, admin);
  assert.equal(d.code, 200);
});
