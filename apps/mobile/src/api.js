import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const API_PORT = 3100;

// Where the API lives. Order: explicit EXPO_PUBLIC_API_URL, then the dev machine that is serving this app
// (works for a real phone on the same Wi-Fi, the Android emulator and the browser), then the emulator alias.
function resolveBase() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') return `http://${window.location.hostname}:${API_PORT}`;
  const host = (Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '').split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;
  return `http://${Platform.OS === 'android' ? '10.0.2.2' : 'localhost'}:${API_PORT}`;
}
export const BASE = resolveBase();

export async function deviceId() {
  let id = await AsyncStorage.getItem('device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem('device_id', id);
  }
  return id;
}

export async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error ?? 'request_failed');
    e.status = res.status;
    throw e;
  }
  return data;
}

// ---- offline queue: punches taken without network are stored and synced later; the server re-validates them.
const QKEY = 'punch_queue';
export async function queuePunch(p) {
  const q = JSON.parse((await AsyncStorage.getItem(QKEY)) ?? '[]');
  q.push(p);
  await AsyncStorage.setItem(QKEY, JSON.stringify(q));
}
export async function queueSize() {
  return JSON.parse((await AsyncStorage.getItem(QKEY)) ?? '[]').length;
}
export async function flushQueue(token) {
  const q = JSON.parse((await AsyncStorage.getItem(QKEY)) ?? '[]');
  const left = [];
  for (const p of q) {
    try {
      await call('POST', '/punch', token, { ...p, offline: true });
    } catch (e) {
      if (!e.status) left.push(p); // network error: keep it. Server rejections (4xx) are dropped.
    }
  }
  await AsyncStorage.setItem(QKEY, JSON.stringify(left));
  return left.length;
}
