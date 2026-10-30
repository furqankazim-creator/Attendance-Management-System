import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFence, distanceMeters } from '../src/geofence.js';
import { scoreRisk } from '../src/risk.js';
import { attendanceStatus } from '../src/status.js';

const circle = { type: 'circle', lat: 24.8607, lng: 67.0011, radius_m: 100 };

test('inside circle', () => assert.equal(checkFence(circle, { lat: 24.8608, lng: 67.0012 }, 10).inside, true));
test('outside circle', () => assert.equal(checkFence(circle, { lat: 24.87, lng: 67.01 }, 10).inside, false));
test('low accuracy flagged', () => assert.equal(checkFence(circle, { lat: 24.8607, lng: 67.0011 }, 120).accuracy_ok, false));
test('polygon', () => {
  const poly = { type: 'polygon', points: [[0, 0], [0, 1], [1, 1], [1, 0]] };
  assert.equal(checkFence(poly, { lat: 0.5, lng: 0.5 }, 5).inside, true);
  assert.equal(checkFence(poly, { lat: 2, lng: 2 }, 5).inside, false);
});
test('distance ~111km per degree lat', () => {
  const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(d > 110000 && d < 112000);
});
test('mock is high risk', () =>
  assert.equal(scoreRisk({ mock: true, accuracy: 5, deviceMatches: true, now: 1, point: {} }).level, 'high'));
test('clean punch is low risk', () =>
  assert.equal(scoreRisk({ mock: false, accuracy: 5, deviceMatches: true, now: 1, point: {} }).level, 'low'));
test('impossible travel', () => {
  const r = scoreRisk({ mock: false, accuracy: 5, deviceMatches: true, previous: { ts: 0, lat: 0, lng: 0 }, point: { lat: 5, lng: 0 }, now: 3600000 });
  assert.ok(r.reasons.includes('impossible_travel'));
});
test('status present/late/absent', () => {
  const shift = { start: '09:00', grace_min: 10 };
  assert.equal(attendanceStatus(shift, new Date('2026-01-01T09:05:00Z')), 'present');
  assert.equal(attendanceStatus(shift, new Date('2026-01-01T09:11:00Z')), 'late');
  assert.equal(attendanceStatus(shift, null), 'absent');
});
