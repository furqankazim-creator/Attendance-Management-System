export const C = {
  bg: '#F2F4FD', card: '#FFFFFF', ink: '#14163A', mute: '#6B7094', line: '#E6E8F5',
  primary: '#4F46E5', soft: '#ECEAFD',
  g1: '#14B8A6', g2: '#4F46E5',
  ok: '#10B981', okSoft: '#DCF8EE', warn: '#F59E0B', warnSoft: '#FFF1D6', bad: '#EF4444', badSoft: '#FDE4E4',
  info: '#38BDF8', violet: '#8B5CF6', violetSoft: '#EDE7FE', grey: '#8593B0',
};
export const GRAD = ['#14B8A6', '#3B82F6', '#4F46E5'];

// Poppins (loaded in App.js)
export const F = {
  r: 'Poppins_400Regular', m: 'Poppins_500Medium', sb: 'Poppins_600SemiBold',
  b: 'Poppins_700Bold', xb: 'Poppins_800ExtraBold',
};

import { Platform } from 'react-native';
export const shadowOf = (opacity = 0.1, radius = 14, y = 6) => (Platform.OS === 'web'
  ? { boxShadow: `0px ${y}px ${radius}px rgba(30,64,175,${opacity})` }
  : { shadowColor: '#4F46E5', shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: y }, elevation: Math.round(opacity * 40) });
export const shadow = shadowOf();

export const pad2 = (n) => String(n).padStart(2, '0');
export const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`; };
export const hm = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; };
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--');
export const isoDay = (d) => d.toISOString().slice(0, 10);
export const parseDay = (s) => new Date(s + 'T00:00:00Z');
export const addDays = (s, n) => isoDay(new Date(parseDay(s).getTime() + n * 86400000));
export const mondayOf = (s) => addDays(s, -((parseDay(s).getUTCDay() + 6) % 7));
export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const prettyDay = (s) => { const d = parseDay(s); return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`; };

const COLORS = ['#4F46E5', '#14B8A6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444', '#6366F1'];
export const colorFor = (s = '') => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
export const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';

export const MESSAGES = {
  outside_fence: 'You are outside the work area.',
  gps_accuracy_too_low: 'GPS signal is weak. Move to an open area and try again.',
  mock_location_detected: 'Fake location detected. This attempt was logged.',
  already_checked_in: 'You are already checked in.',
  not_checked_in: 'You are not checked in.',
  no_site_assigned: 'No work site assigned yet. Ask your admin.',
  bad_credentials: 'Wrong email or password.',
  account_disabled: 'This account is disabled.',
  bad_dates: 'Check the dates (the end must not be before the start).',
  break_already_open: 'A break is already running.',
  no_open_break: 'There is no break to end.',
  already_submitted: 'This week is already submitted.',
  already_approved: 'This week is already approved.',
};
export const msg = (e) => MESSAGES[e.message] ?? (e.status ? e.message : 'No connection to the server.');
