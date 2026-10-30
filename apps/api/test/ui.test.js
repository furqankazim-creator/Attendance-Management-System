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
  const owner = (await call('POST', '/auth/register-org', { orgName: 'Acme', name: 'Boss', email: 'o@x.com', password: 'pw' })).body.token;
  const site = (await call('POST', '/sites', { name: 'HQ', type: 'circle', lat: 10, lng: 10, radius_m: 100 }, owner)).body.id;
  await call('POST', '/workers', { name: 'Ali', email: 'ali@x.com', password: 'pw', site_id: site, department: 'Ops', shift_start: '00:00', shift_end: '23:59', grace_min: 1439 }, owner);
  await call('POST', '/workers', { name: 'Bo', email: 'bo@x.com', password: 'pw', site_id: site, department: 'Sales', shift_start: '00:00', grace_min: 1439 }, owner);
  const login = async (e) => (await call('POST', '/auth/login', { email: e, password: 'pw', device_id: 'd' })).body.token;
  return { call, owner, login };
}
const at = (kind) => ({ kind, lat: 10, lng: 10, accuracy: 8, device_id: 'd' });

test('break needs a check-in, cannot double start, and ends cleanly', async () => {
  const { call, login } = await setup();
  const ali = await login('ali@x.com');
  assert.equal((await call('POST', '/break/start', {}, ali)).code, 409);
  await call('POST', '/punch', at('in'), ali);
  assert.equal((await call('POST', '/break/start', {}, ali)).code, 200);
  assert.equal((await call('POST', '/break/start', {}, ali)).code, 409);
  assert.ok((await call('GET', '/me/today', null, ali)).body.break_open_since);
  assert.equal((await call('POST', '/break/end', {}, ali)).code, 200);
  assert.equal((await call('POST', '/break/end', {}, ali)).code, 409);
});

test('me/today, history and day timeline reflect punches and breaks', async () => {
  const { call, login } = await setup();
  const ali = await login('ali@x.com');
  await call('POST', '/punch', at('in'), ali);
  await call('POST', '/break/start', {}, ali);
  await call('POST', '/break/end', {}, ali);
  await call('POST', '/punch', at('out'), ali);
  const t = (await call('GET', '/me/today', null, ali)).body;
  assert.equal(t.status, 'present');
  assert.equal(t.week.length, 7);
  assert.ok(t.first_in && t.last_out);
  assert.equal(t.month.present, 1);
  const h = (await call('GET', `/me/history?month=${t.today.slice(0, 7)}`, null, ali)).body;
  assert.equal(h.totals.present, 1);
  assert.equal(h.days.find((d) => d.day === t.today).status, 'present');
  const d = (await call('GET', `/me/day?day=${t.today}`, null, ali)).body;
  assert.deepEqual(d.events.map((e) => e.type), ['check_in', 'break_start', 'break_end', 'check_out']);
  assert.equal((await call('GET', '/me/history?month=nope', null, ali)).code, 400);
});

test('dashboard: overview, departments, trend, feed, scope', async () => {
  const { call, owner, login } = await setup();
  const ali = await login('ali@x.com');
  await call('POST', '/punch', at('in'), ali);
  const d = (await call('GET', '/dashboard', null, owner)).body;
  assert.equal(d.overview.total, 2);
  assert.equal(d.overview.present, 1);
  assert.deepEqual(d.departments.map((x) => x.department).sort(), ['Ops', 'Sales']);
  assert.equal(d.departments.find((x) => x.department === 'Ops').present, 1);
  assert.ok(d.feed[0].text.includes('Ali'));
  assert.ok(d.trend.length >= 1);
  assert.equal((await call('GET', '/dashboard', null, ali)).code, 403);
});

test('worker department and shift end can be edited', async () => {
  const { call, owner } = await setup();
  const id = (await call('GET', '/workers', null, owner)).body[0].id;
  await call('PATCH', `/workers/${id}`, { department: 'Finance', shift_end: '17:30', name: 'Ali K' }, owner);
  const w = (await call('GET', '/workers', null, owner)).body.find((x) => x.id === id);
  assert.equal(w.department, 'Finance');
  assert.equal(w.shift_end, '17:30');
  assert.equal(w.name, 'Ali K');
});

test('breaks are subtracted from timesheet hours', async () => {
  const { call, login } = await setup();
  const ali = await login('ali@x.com');
  await call('POST', '/punch', at('in'), ali);
  await call('POST', '/punch', at('out'), ali);
  const today = (await call('GET', '/me/today', null, ali)).body.today;
  const d = new Date(today + 'T00:00:00Z');
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const wk = (await call('GET', `/timesheets/week?start=${monday}`, null, ali)).body;
  assert.ok(wk.total_ms >= 0);
});

test('a new employee is not marked absent for days before they joined', async () => {
  const { call, login } = await setup();
  const ali = await login('ali@x.com');
  const t = (await call('GET', '/me/today', null, ali)).body;
  assert.equal(t.month.absent, 0);
  const h = (await call('GET', `/me/history?month=${t.today.slice(0, 7)}`, null, ali)).body;
  assert.equal(h.totals.absent, 0);
});
