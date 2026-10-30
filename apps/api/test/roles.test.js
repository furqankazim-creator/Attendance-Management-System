import test from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { newApp, stopAll } from './helper.js';
after(stopAll);

const inside = (lat, lng) => ({ kind: 'in', lat, lng, accuracy: 8, device_id: 'd' });

async function setup() {
  const app = await newApp();
  const call = async (method, url, payload, token) => {
    const r = await app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
    const isJson = (r.headers['content-type'] ?? '').includes('json');
    return { code: r.statusCode, body: isJson ? r.json() : r.body };
  };
  const login = async (email) => (await call('POST', '/auth/login', { email, password: 'pw', device_id: 'd' })).body.token;
  const owner = (await call('POST', '/auth/register-org', { orgName: 'Acme', name: 'Boss', email: 'o@x.com', password: 'pw' })).body.token;
  const siteA = (await call('POST', '/sites', { name: 'A', type: 'circle', lat: 10, lng: 10, radius_m: 100 }, owner)).body.id;
  const siteB = (await call('POST', '/sites', { name: 'B', type: 'circle', lat: 20, lng: 20, radius_m: 100 }, owner)).body.id;
  for (const [n, site] of [['wa', siteA], ['wb', siteB]])
    await call('POST', '/workers', { name: n, email: `${n}@x.com`, password: 'pw', site_id: site, shift_start: '00:00', grace_min: 1439 }, owner);
  await call('POST', '/staff', { name: 'Hr', email: 'hr@x.com', password: 'pw', role: 'hr' }, owner);
  await call('POST', '/staff', { name: 'Sup', email: 'sup@x.com', password: 'pw', role: 'supervisor', site_id: siteA }, owner);
  await call('POST', '/staff', { name: 'Aud', email: 'aud@x.com', password: 'pw', role: 'auditor' }, owner);
  return { call, login, owner, siteA, siteB };
}

test('only the owner can manage staff', async () => {
  const { call, login } = await setup();
  const hr = await login('hr@x.com');
  assert.equal((await call('GET', '/staff', null, hr)).code, 403);
  assert.equal((await call('POST', '/staff', { name: 'x', email: 'x@x.com', password: 'pw', role: 'hr' }, hr)).code, 403);
});

test('supervisor needs a site and cannot be created as owner', async () => {
  const { call, owner } = await setup();
  assert.equal((await call('POST', '/staff', { name: 'x', email: 'x@x.com', password: 'pw', role: 'supervisor' }, owner)).code, 400);
  assert.equal((await call('POST', '/staff', { name: 'x', email: 'x@x.com', password: 'pw', role: 'owner' }, owner)).code, 400);
});

test('hr manages sites and workers; supervisor and auditor cannot', async () => {
  const { call, login } = await setup();
  const hr = await login('hr@x.com'), sup = await login('sup@x.com'), aud = await login('aud@x.com');
  const site = { name: 'C', type: 'circle', lat: 1, lng: 1, radius_m: 100 };
  assert.equal((await call('POST', '/sites', site, hr)).code, 200);
  assert.equal((await call('POST', '/sites', site, sup)).code, 403);
  assert.equal((await call('POST', '/sites', site, aud)).code, 403);
  assert.equal((await call('POST', '/workers', { name: 'n', email: 'n@x.com', password: 'pw' }, sup)).code, 403);
});

test('auditor is read-only but can read the audit log; supervisor cannot', async () => {
  const { call, login } = await setup();
  const aud = await login('aud@x.com'), sup = await login('sup@x.com');
  assert.equal((await call('GET', '/audit', null, aud)).code, 200);
  assert.equal((await call('GET', '/audit', null, sup)).code, 403);
  assert.equal((await call('GET', '/board', null, aud)).code, 200);
  assert.equal((await call('POST', '/leaves/1/decision', { decision: 'approved' }, aud)).code, 403);
});

test('supervisor only sees and decides for their own site', async () => {
  const { call, login } = await setup();
  const sup = await login('sup@x.com'), wa = await login('wa@x.com'), wb = await login('wb@x.com');
  const la = await call('POST', '/leaves', { from_day: '2026-11-01', to_day: '2026-11-02' }, wa);
  const lb = await call('POST', '/leaves', { from_day: '2026-11-01', to_day: '2026-11-02' }, wb);
  const board = await call('GET', '/board', null, sup);
  assert.deepEqual(board.body.map((w) => w.name), ['wa']);
  const leaves = await call('GET', '/leaves', null, sup);
  assert.equal(leaves.body.length, 1);
  assert.equal((await call('POST', `/leaves/${lb.body.id}/decision`, { decision: 'approved' }, sup)).code, 404);
  assert.equal((await call('POST', `/leaves/${la.body.id}/decision`, { decision: 'approved' }, sup)).code, 200);
  await call('POST', '/punch', inside(10, 10), wa);
  await call('POST', '/punch', inside(20, 20), wb);
  const rep = await call('GET', '/reports/attendance', null, sup);
  assert.deepEqual(rep.body.map((r) => r.worker), ['wa']);
  assert.equal((await call('GET', '/stats', null, sup)).body.workers, 1);
});

test('workers have no staff permissions; disabling staff blocks existing tokens', async () => {
  const { call, login, owner } = await setup();
  const wa = await login('wa@x.com'), hr = await login('hr@x.com');
  assert.equal((await call('GET', '/board', null, wa)).code, 403);
  const staff = (await call('GET', '/staff', null, owner)).body;
  const hrId = staff.find((s) => s.email === 'hr@x.com').id;
  await call('PATCH', `/staff/${hrId}`, { active: false }, owner);
  assert.equal((await call('GET', '/board', null, hr)).code, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'hr@x.com', password: 'pw' })).code, 403);
});

test('role change takes effect on the existing token', async () => {
  const { call, login, owner } = await setup();
  const hr = await login('hr@x.com');
  assert.equal((await call('GET', '/audit', null, hr)).code, 200);
  const hrId = (await call('GET', '/staff', null, owner)).body.find((s) => s.email === 'hr@x.com').id;
  await call('PATCH', `/staff/${hrId}`, { role: 'auditor' }, owner);
  assert.equal((await call('POST', '/sites', { name: 'Z', type: 'circle', lat: 1, lng: 1, radius_m: 100 }, hr)).code, 403);
});
