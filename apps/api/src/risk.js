import { distanceMeters } from './geofence.js';

/** Returns { score 0-100, level, reasons[] } for a punch. */
export function scoreRisk({ mock, accuracy, deviceMatches, previous, point, now }) {
  const reasons = [];
  let score = 0;
  if (mock) { score += 60; reasons.push('mock_location'); }
  if (!deviceMatches) { score += 40; reasons.push('unregistered_device'); }
  if (typeof accuracy !== 'number') { score += 20; reasons.push('no_accuracy'); }
  else if (accuracy > 30) { score += 15; reasons.push('low_accuracy'); }
  if (previous) {
    const hours = (now - previous.ts) / 3600000;
    const km = distanceMeters(previous, point) / 1000;
    if (hours > 0 && km / hours > 200 && km > 1) { score += 50; reasons.push('impossible_travel'); }
  }
  score = Math.min(100, score);
  const level = score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { score, level, reasons };
}
