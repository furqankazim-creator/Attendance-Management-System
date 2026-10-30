const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ring: [[lat,lng],...]
export function pointInPolygon(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export const MAX_ACCURACY_M = 50;

/**
 * site: { type:'circle', lat, lng, radius_m } | { type:'polygon', points:[[lat,lng],...] }
 * Returns { inside, distance_m, accuracy_ok }
 */
export function checkFence(site, point, accuracy) {
  const accuracy_ok = typeof accuracy === 'number' && accuracy <= MAX_ACCURACY_M;
  if (site.type === 'polygon') {
    return { inside: pointInPolygon(point, site.points), distance_m: null, accuracy_ok };
  }
  const d = distanceMeters({ lat: site.lat, lng: site.lng }, point);
  return { inside: d <= site.radius_m, distance_m: Math.round(d), accuracy_ok };
}
