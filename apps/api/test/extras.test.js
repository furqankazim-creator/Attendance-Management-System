import test from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { newApp, stopAll } from './helper.js';
after(stopAll);

const monday = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};

async function setup() {
  const app = await newApp();
  const call = async (method, url, payload, token, headers = {}) => {
    const r = await app.inject({ method, url, payload, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
    const isJson = (r.headers['content-type'] ?? '').includes('json');
    return { code: r.statusCode, body: isJson ? r.json() : r.body };
  };
  const owner = (await call('POST', '/auth/register-org', { orgName: 'Acme', name: 'Boss', email: 'o@x.com', password: 'pw' })).body.token;
  const siteA = (await call('POST', '/sites', { name: 'A', type: 'circle', lat: 10, lng: 10, radius_m: 100 }, owner)).body.id;
  const siteB = (await call('POST', '/sites', { name: 'B', type: 'circle', lat: 20, lng: 20, radius_m: 100 }, owner)).body.id;
  const w = await call('POST', '/workers', { name: 'Ali', email: 'ali@x.com', password: 'pw', site_id: siteA, shift_start: '00:00', grace_min: 1439 }, owner);
  const other = await call('POST', '/workers', { name: 'Bo', email: 'bo@x.com', password: 'pw', site_id: siteB, shift_start: '00:00', grace_min: 1439 }, owner);
  await call('POST', '/staff', { name: 'Sup', email: 'sup@x.com', password: 'pw', role: 'supervisor', site_id: siteB }, owner);
  const login = async (email) => (await call('POST', '/auth/login', { email, password: 'pw', device_id: 'd' })).body.token;
  return { call, owner, login, siteA, siteB, worker: w.body, other: other.body };
}
const at = (lat, lng, kind) => ({ kind, lat, lng, accuracy: 8, device_id: 'd' });

test('new worker gets a 4 digit PIN once', async () => {
  const { worker } = await setup();
  assert.match(worker.pin, /^\d{4}$/);
});

test('map shows punch points and respects supervisor scope', async () => {
  const { call, owner, login } = await setup();
  const ali = await login('ali@x.com'), bo = await login('bo@x.com'), sup = await login('sup@x.com');
  await call('POST', '/punch', at(10, 10, 'in'), ali);
  await call('POST', '/punch', at(20, 20, 'in'), bo);
  const all = await call('GET', '/map', null, owner);
  assert.deepEqual(all.body.workers.map((w) => w.name).sort(), ['Ali', 'Bo']);
  assert.equal(all.body.workers[0].last.kind, 'in');
  const scoped = await call('GET', '/map', null, sup);
  assert.deepEqual(scoped.body.workers.map((w) => w.name), ['Bo']);
  assert.equal((await call('GET', '/map', null, ali)).code, 403);
});

test('timesheet: hours, submit, approve, no double submit', async () => {
  const { call, owner, login } = await setup();
  const ali = await login('ali@x.com');
  await call('POST', '/punch', at(10, 10, 'in'), ali);
  await call('POST', '/punch', at(10, 10, 'out'), ali);
  const wk = monday();
  const week = await call('GET', `/timesheets/week?start=${wk}`, null, ali);
  assert.equal(week.body.days.length, 7);
  assert.equal(week.body.state, 'open');
  assert.equal((await call('GET', '/timesheets/week?start=2026-01-02', null, ali)).code, 400);
  assert.equal((await call('POST', '/timesheets/submit', { week_start: wk }, ali)).code, 200);
  assert.equal((await call('POST', '/timesheets/submit', { week_start: wk }, ali)).code, 409);
  const list = await call('GET', '/timesheets', null, owner);
  assert.equal(list.body[0].state, 'submitted');
  assert.equal((await call('POST', `/timesheets/${list.body[0].id}/decision`, { decision: 'rejected', note: 'fix Tuesday' }, owner)).code, 200);
  assert.equal((await call('GET', `/timesheets/week?start=${wk}`, null, ali)).body.note, 'fix Tuesday');
  assert.equal((await call('POST', '/timesheets/submit', { week_start: wk }, ali)).code, 200); // resubmit after rejection
  const id = (await call('GET', '/timesheets', null, owner)).body[0].id;
  assert.equal((await call('POST', `/timesheets/${id}/decision`, { decision: 'approved' }, owner)).code, 200);
  assert.equal((await call('POST', `/timesheets/${id}/decision`, { decision: 'approved' }, owner)).code, 409);
  assert.equal((await call('POST', '/timesheets/submit', { week_start: wk }, ali)).code, 409);
});

test('supervisor cannot decide another site timesheet', async () => {
  const { call, owner, login } = await setup();
  const ali = await login('ali@x.com'), sup = await login('sup@x.com');
  await call('POST', '/timesheets/submit', { week_start: monday() }, ali);
  const id = (await call('GET', '/timesheets', null, owner)).body[0].id;
  assert.equal((await call('GET', '/timesheets', null, sup)).body.length, 0);
  assert.equal((await call('POST', `/timesheets/${id}/decision`, { decision: 'approved' }, sup)).code, 404);
});

test('kiosk: PIN punch toggles in/out, wrong site and bad PIN refused, lockout', async () => {
  const { call, owner, siteA, worker, other } = await setup();
  const k = await call('POST', '/kiosks', { name: 'Front door', site_id: siteA }, owner);
  const hdr = { 'x-kiosk-token': k.body.token };
  assert.equal((await call('GET', '/kiosk/info', null, null, hdr)).body.site, 'A');
  assert.equal((await call('POST', '/kiosk/punch', { worker_id: worker.id, pin: worker.pin }, null, { 'x-kiosk-token': 'nope' })).code, 401);

  const a = await call('POST', '/kiosk/punch', { worker_id: worker.id, pin: worker.pin }, null, hdr);
  assert.equal(a.code, 200);
  assert.equal(a.body.kind, 'in');
  assert.equal(a.body.status, 'present');
  const b = await call('POST', '/kiosk/punch', { worker_id: worker.id, pin: worker.pin }, null, hdr);
  assert.equal(b.body.kind, 'out');

  assert.equal((await call('POST', '/kiosk/punch', { worker_id: other.id, pin: other.pin }, null, hdr)).code, 403); // assigned to site B
  assert.equal((await call('POST', '/kiosk/punch', { worker_id: 9999, pin: '0000' }, null, hdr)).body.error, 'bad_id_or_pin');

  const bad = worker.pin === '0000' ? '1111' : '0000';
  for (let i = 0; i < 5; i++) await call('POST', '/kiosk/punch', { worker_id: worker.id, pin: bad }, null, hdr);
  assert.equal((await call('POST', '/kiosk/punch', { worker_id: worker.id, pin: worker.pin }, null, hdr)).code, 429);
});

test('kiosk punches show on the board and are marked as kiosk', async () => {
  const { call, owner, siteA, worker } = await setup();
  const k = await call('POST', '/kiosks', { name: 'Door', site_id: siteA }, owner);
  await call('POST', '/kiosk/punch', { worker_id: worker.id, pin: worker.pin }, null, { 'x-kiosk-token': k.body.token });
  const map = await call('GET', '/map', null, owner);
  assert.equal(map.body.workers[0].last.source, 'kiosk');
  assert.equal((await call('GET', '/board', null, owner)).body.find((w) => w.name === 'Ali').state, 'in');
});

test('PIN reset returns a new PIN that works', async () => {
  const { call, owner, siteA, worker } = await setup();
  const k = await call('POST', '/kiosks', { name: 'Door', site_id: siteA }, owner);
  const hdr = { 'x-kiosk-token': k.body.token };
  const np = (await call('POST', `/workers/${worker.id}/pin`, {}, owner)).body.pin;
  assert.equal((await call('POST', '/kiosk/punch', { worker_id: worker.id, pin: np }, null, hdr)).code, 200);
});
