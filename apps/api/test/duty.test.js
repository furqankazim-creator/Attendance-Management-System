import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { newApp, stopAll } from './helper.js';
after(stopAll);

const MIN = 60000;
const HQ = { lat: 10, lng: 10 };
const FAR = { lat: 10.05, lng: 10.05 };

// The organisation clock is set so it is about noon "local" right now, and the shift runs 00:00-23:59 local,
// so every test is on duty whatever time of day it really runs.
async function setup(siteExtra = {}) {
  const app = await newApp();
  const call = async (method, url, payload, token) => {
    const r = await app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { code: r.statusCode, body: (r.headers['content-type'] ?? '').includes('json') ? r.json() : r.body };
  };
  const utcMin = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const owner = (await call('POST', '/auth/register-org', { orgName: 'Acme', name: 'Boss', email: 'o@x.com', password: 'pw', tz_offset_min: 720 - utcMin })).body.token;
  const site = (await call('POST', '/sites', { name: 'HQ', type: 'circle', ...HQ, radius_m: 150, ...siteExtra }, owner)).body.id;
  await call('POST', '/workers', { name: 'Ali', email: 'ali@x.com', password: 'pw', site_id: site, shift_start: '00:00', shift_end: '23:59', grace_min: 1439 }, owner);
  const ali = (await call('POST', '/auth/login', { email: 'ali@x.com', password: 'pw', device_id: 'd' })).body.token;
  return { app, call, owner, ali, site };
}
const inside = { kind: 'in', ...HQ, accuracy: 8, device_id: 'd' };
const outsideOut = { kind: 'out', ...FAR, accuracy: 8, device_id: 'd' };
const ev = (event, extra = {}) => ({ source: 'auto', event, ...HQ, accuracy: 30, device_id: 'd', ...extra });

test('leaving the area (automatic exit) raises a left-area alert for managers', async () => {
  const { call, owner, ali } = await setup();
  await call('POST', '/punch', ev('enter', { device_ts: Date.now() - 20 * MIN }), ali);
  const r = await call('POST', '/punch', ev('exit', FAR), ali);
  assert.equal(r.code, 200);
  const a = (await call('GET', '/alerts', null, owner)).body;
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].type, 'left_area');
  assert.match(a.items[0].text, /Ali left HQ at \d\d:\d\d, .* before shift end/);
  assert.equal(a.unseen, 1);
});

test('an outside check-out raises an alert and the later return reports the time away', async () => {
  const { call, owner, ali } = await setup();
  await call('POST', '/punch', inside, ali);
  assert.equal((await call('POST', '/punch', outsideOut, ali)).code, 200);
  assert.equal((await call('POST', '/punch', inside, ali)).code, 200);
  const types = (await call('GET', '/alerts', null, owner)).body.items.map((x) => x.type).sort();
  assert.deepEqual(types, ['left_area', 'returned']);
});

test('away for too long raises one alert for managers and one for the worker, only once', async () => {
  const { app, call, owner, ali } = await setup({ away_alert_min: 10 });
  await call('POST', '/punch', inside, ali);
  await call('POST', '/punch', outsideOut, ali);
  assert.equal((await app.runDuty(Date.now() + 5 * MIN)).away, 0); // not long enough yet
  assert.equal((await app.runDuty(Date.now() + 11 * MIN)).away, 1);
  assert.equal((await app.runDuty(Date.now() + 12 * MIN)).away, 0); // never twice for the same absence
  const mgr = (await call('GET', '/alerts', null, owner)).body.items.filter((x) => x.type === 'away_long');
  assert.equal(mgr.length, 1);
  assert.match(mgr[0].text, /Ali has been away from HQ for 1[01] min/);
  const mine = (await call('GET', '/me/alerts', null, ali)).body;
  assert.equal(mine.items.length, 1);
  assert.match(mine.items[0].text, /You have been outside the work area/);
});

test('no away alert once the worker is back', async () => {
  const { app, call, ali } = await setup({ away_alert_min: 10 });
  await call('POST', '/punch', inside, ali);
  await call('POST', '/punch', outsideOut, ali);
  await call('POST', '/punch', inside, ali);
  assert.equal((await app.runDuty(Date.now() + 30 * MIN)).away, 0);
});

test('a day nobody checked out of is closed automatically at shift end, once', async () => {
  const { app, call, owner, ali } = await setup({ auto_close_after_min: 30 });
  await call('POST', '/punch', inside, ali);
  assert.equal((await app.runDuty(Date.now() + MIN)).closed, 0); // shift not over yet
  const later = Date.now() + 3 * 86400000;
  assert.equal((await app.runDuty(later)).closed, 1);
  assert.equal((await app.runDuty(later)).closed, 0);
  const today = (await call('GET', '/me/today', null, ali)).body;
  assert.equal(today.checked_in, false);
  const mine = (await call('GET', '/me/alerts', null, ali)).body.items;
  assert.equal(mine[0].type, 'auto_closed');
  assert.match(mine[0].text, /closed your day at \d\d:\d\d/);
  const mgr = (await call('GET', '/alerts', null, owner)).body.items;
  assert.ok(mgr.some((x) => x.type === 'auto_closed' && /did not check out/.test(x.text)));
  const feed = (await call('GET', '/dashboard', null, owner)).body.feed.map((f) => f.text).join('|');
  assert.match(feed, /checked out automatically at shift end/);
});

test('auto close ends an open break and can be switched off per site', async () => {
  const a = await setup();
  await a.call('POST', '/punch', inside, a.ali);
  await a.call('POST', '/break/start', {}, a.ali);
  await a.app.runDuty(Date.now() + 3 * 86400000);
  assert.equal((await a.call('GET', '/me/today', null, a.ali)).body.break_open_since, null);

  const b = await setup({ auto_close: false });
  await b.call('POST', '/punch', inside, b.ali);
  assert.equal((await b.app.runDuty(Date.now() + 3 * 86400000)).closed, 0);
  assert.equal((await b.call('GET', '/me/today', null, b.ali)).body.checked_in, true);
});

test('alerts can be marked seen, and a supervisor only sees their own site', async () => {
  const { call, owner, ali, site } = await setup();
  await call('POST', '/punch', inside, ali);
  await call('POST', '/punch', outsideOut, ali);
  const other = (await call('POST', '/sites', { name: 'Branch', type: 'circle', lat: 20, lng: 20, radius_m: 100 }, owner)).body.id;
  assert.notEqual(other, site);
  await call('POST', '/staff', { name: 'Sup', email: 'sup@x.com', password: 'pw', role: 'supervisor', site_id: other }, owner);
  const sup = (await call('POST', '/auth/login', { email: 'sup@x.com', password: 'pw' })).body.token;
  assert.equal((await call('GET', '/alerts', null, sup)).body.items.length, 0);
  assert.equal((await call('GET', '/stats', null, owner)).body.unseenAlerts, 1);
  assert.equal((await call('POST', '/alerts/seen', {}, owner)).body.marked, 1);
  assert.equal((await call('GET', '/stats', null, owner)).body.unseenAlerts, 0);
  assert.equal((await call('GET', '/alerts', null, ali)).code, 403);
});

test('duty settings are validated and saved on the site', async () => {
  const { call, owner, site } = await setup();
  assert.equal((await call('PATCH', `/sites/${site}`, { away_alert_min: 2 }, owner)).code, 400);
  assert.equal((await call('PATCH', `/sites/${site}`, { auto_close_after_min: 999 }, owner)).code, 400);
  assert.equal((await call('PATCH', `/sites/${site}`, { away_alert_min: 45, auto_close_after_min: 90, auto_close: false }, owner)).code, 200);
  const s = (await call('GET', '/sites', null, owner)).body.find((x) => x.id === site);
  assert.equal(s.away_alert_min, 45);
  assert.equal(s.auto_close_after_min, 90);
  assert.equal(s.auto_close, 0);
});
