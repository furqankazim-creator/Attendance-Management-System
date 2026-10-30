import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { newApp, stopAll } from './helper.js';
after(stopAll);

async function setup() {
  const app = await newApp();
  const call = async (method, url, payload, token) => {
    const r = await app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { code: r.statusCode, body: (r.headers['content-type'] ?? '').includes('json') ? r.json() : r.body };
  };
  const owner = (await call('POST', '/auth/register-org', { orgName: 'Acme', name: 'Boss', email: 'o@x.com', password: 'pw' })).body.token;
  const site = (await call('POST', '/sites', { name: 'HQ', type: 'circle', lat: 10, lng: 10, radius_m: 150 }, owner)).body.id;
  await call('POST', '/workers', { name: 'Ali', email: 'ali@x.com', password: 'pw', site_id: site, shift_start: '00:00', grace_min: 1439 }, owner);
  const ali = (await call('POST', '/auth/login', { email: 'ali@x.com', password: 'pw', device_id: 'd' })).body.token;
  return { call, owner, ali, site };
}
const ev = (event, extra = {}) => ({ source: 'auto', event, lat: 10, lng: 10, accuracy: 90, device_id: 'd', ...extra });
const outside = { lat: 10.01, lng: 10.01 };

test('entering the radius checks in automatically at the time the phone saw it', async () => {
  const { call, ali } = await setup();
  const seen = Date.now() - 4 * 60000;
  const r = await call('POST', '/punch', ev('enter', { device_ts: seen }), ali);
  assert.equal(r.code, 200);
  assert.equal(r.body.kind, 'in');
  assert.equal(r.body.source, 'auto');
  assert.equal(r.body.at, new Date(seen).toISOString());
  assert.equal((await call('GET', '/me/today', null, ali)).body.checked_in, true);
});

test('duplicate enter and a stray exit are ignored, not errors', async () => {
  const { call, ali } = await setup();
  assert.equal((await call('POST', '/punch', ev('exit', outside), ali)).body.ignored, true);
  await call('POST', '/punch', ev('enter'), ali);
  const again = await call('POST', '/punch', ev('enter'), ali);
  assert.equal(again.code, 200);
  assert.equal(again.body.reason, 'already_checked_in');
});

test('leaving checks out automatically, even though the phone is outside the fence', async () => {
  const { call, ali } = await setup();
  await call('POST', '/punch', ev('enter', { device_ts: Date.now() - 20 * 60000 }), ali);
  const r = await call('POST', '/punch', ev('exit', { ...outside, accuracy: 30 }), ali);
  assert.equal(r.code, 200);
  assert.equal(r.body.kind, 'out');
  assert.equal((await call('GET', '/me/today', null, ali)).body.checked_in, false);
});

test('an enter event from outside the real fence is refused', async () => {
  const { call, ali } = await setup();
  assert.equal((await call('POST', '/punch', ev('enter', outside), ali)).code, 403);
});

test('a fake location is still refused for automatic events', async () => {
  const { call, ali } = await setup();
  assert.equal((await call('POST', '/punch', ev('enter', { mock: true }), ali)).code, 403);
});

test('an old timestamp cannot backdate an automatic check-in', async () => {
  const { call, ali } = await setup();
  const r = await call('POST', '/punch', ev('enter', { device_ts: Date.now() - 5 * 3600000 }), ali);
  assert.equal(r.code, 200);
  assert.ok(Date.now() - Date.parse(r.body.at) < 5000, 'server time is used when the phone time is too old');
});

test('the site switch turns automatic attendance off', async () => {
  const { call, owner, ali, site } = await setup();
  await call('PATCH', `/sites/${site}`, { auto_attendance: false }, owner);
  assert.equal((await call('POST', '/punch', ev('enter'), ali)).code, 409);
  assert.equal((await call('POST', '/punch', { kind: 'in', lat: 10, lng: 10, accuracy: 8, device_id: 'd' }, ali)).code, 200); // manual still works
  assert.equal((await call('GET', '/me', null, ali)).body.site.auto_attendance, 0);
});
