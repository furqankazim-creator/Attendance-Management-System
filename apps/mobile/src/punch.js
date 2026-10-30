import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { call, deviceId, queuePunch } from './api';

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
export const distance = (a, b) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// Client-side hint only. The server makes the real decision.
export const roughInside = (site, p) => {
  if (!site || !p) return null;
  if (site.type === 'circle') return distance(site, p) <= site.radius_m;
  let inside = false;
  const ring = site.points;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Foreground-only position for the "distance to work area" display. Stops when the screen unmounts. Never sent to the server. */
export function useNearby(enabled) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let sub;
    let dead = false;
    (async () => {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== 'granted' || dead) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 10000 },
        (l) => setPos({ lat: l.coords.latitude, lng: l.coords.longitude, acc: l.coords.accuracy }));
    })();
    return () => { dead = true; sub?.remove(); };
  }, [enabled]);
  return pos;
}

/** Reads a fresh GPS fix and sends the punch. Falls back to the offline queue when the network is down. */
export async function doPunch(token, kind) {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw Object.assign(new Error('Location permission is needed to punch.'), { status: 1 });
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const body = {
    kind, lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy,
    mock: !!loc.mocked, device_id: await deviceId(), device_ts: Date.now(),
  };
  try {
    const r = await call('POST', '/punch', token, body);
    return { offline: false, status: r.status, review: r.review };
  } catch (e) {
    if (e.status) throw e;
    await queuePunch(body);
    return { offline: true };
  }
}
