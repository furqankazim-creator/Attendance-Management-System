// Automatic attendance. The operating system watches the work area and wakes the app only when the phone enters or leaves it;
// the app then reads one position and tells the server, which makes the real decision. No trail is recorded in between.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { call, deviceId, queuePunch } from './api';

export const TASK = 'geowork-geofence';
const PREF = 'auto_attendance';

// Background location is not available inside the Expo Go app: it needs the installed (development or store) build.
export const inExpoGo = Constants.executionEnvironment === 'storeClient';

/** Sends one automatic event. Falls back to the offline queue when there is no network. Returns the server answer or null. */
export async function sendAuto(token, event, pos) {
  const body = {
    source: 'auto', event, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy,
    mock: !!pos.mocked, device_id: await deviceId(), device_ts: Date.now(),
  };
  try { return await call('POST', '/punch', token, body); }
  catch (e) { if (!e.status) await queuePunch({ ...body, offline: true }); return null; }
}

if (!inExpoGo) {
  // Runs in the background when the OS reports a boundary crossing, even if the app is closed.
  TaskManager.defineTask(TASK, async ({ data, error }) => {
    if (error || !data) return;
    const event = data.eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
    const raw = await AsyncStorage.getItem('session');
    if (!raw) return;
    let pos = null;
    try { pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); }
    catch { pos = await Location.getLastKnownPositionAsync().catch(() => null); }
    if (pos) await sendAuto(JSON.parse(raw).token, event, pos);
  });
}

const rad = (d) => (d * Math.PI) / 180;
const dist = (a, b) => {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

/** The OS only understands circles, so a polygon site is registered as a circle that covers it; the server checks the exact shape. */
export function regionFor(site) {
  if (site.type === 'circle') return { identifier: `site-${site.id}`, latitude: site.lat, longitude: site.lng, radius: Math.max(site.radius_m, 100), notifyOnEnter: true, notifyOnExit: true };
  const lat = site.points.reduce((a, p) => a + p[0], 0) / site.points.length;
  const lng = site.points.reduce((a, p) => a + p[1], 0) / site.points.length;
  const r = Math.max(...site.points.map((p) => dist([lat, lng], p)));
  return { identifier: `site-${site.id}`, latitude: lat, longitude: lng, radius: Math.max(Math.ceil(r) + 30, 100), notifyOnEnter: true, notifyOnExit: true };
}

export const REASONS = {
  expo_go: 'Automatic attendance needs the installed GeoWork app. It cannot run inside Expo Go.',
  no_site: 'No work location is assigned to you yet.',
  site_off: 'Automatic attendance is turned off for your work location. Ask your admin.',
  denied: 'Location permission was not allowed.',
  need_always: 'Choose "Allow all the time" for location, so the phone can notice you arriving while the app is closed.',
};

// The first-login offer is shown once per employee on this phone.
export const askedBefore = async (userId) => (await AsyncStorage.getItem(`auto_asked_${userId}`)) === '1';
export const markAsked = (userId) => AsyncStorage.setItem(`auto_asked_${userId}`, '1');

export async function autoWanted() { return (await AsyncStorage.getItem(PREF)) === '1'; }

/** Asks for the permissions and starts watching the site. Returns { ok, reason }. */
export async function enableAuto(site) {
  if (inExpoGo) return { ok: false, reason: 'expo_go' };
  if (!site) return { ok: false, reason: 'no_site' };
  if (site.auto_attendance === 0) return { ok: false, reason: 'site_off' };
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'denied' };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return { ok: false, reason: 'need_always' };
  await Location.startGeofencingAsync(TASK, [regionFor(site)]);
  await AsyncStorage.setItem(PREF, '1');
  return { ok: true };
}

export async function disableAuto() {
  await AsyncStorage.setItem(PREF, '0');
  if (!inExpoGo && (await Location.hasStartedGeofencingAsync(TASK).catch(() => false))) await Location.stopGeofencingAsync(TASK);
}

/** Called after sign-in and whenever the profile reloads: keeps the watched region equal to the employee's current site. */
export async function syncAuto(site) {
  if (inExpoGo || !(await autoWanted())) return;
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  if (!site || site.auto_attendance === 0 || bg?.status !== 'granted') {
    if (await Location.hasStartedGeofencingAsync(TASK).catch(() => false)) await Location.stopGeofencingAsync(TASK);
    return;
  }
  await Location.startGeofencingAsync(TASK, [regionFor(site)]);
}

export async function isWatching() {
  if (inExpoGo) return false;
  return (await autoWanted()) && (await Location.hasStartedGeofencingAsync(TASK).catch(() => false));
}
