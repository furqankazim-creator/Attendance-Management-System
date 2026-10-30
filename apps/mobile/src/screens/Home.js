import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { C, DOW, F, clock, hm, hms, localToday, msg, parseDay, prettyDay } from '../theme';
import { Card, Chip, Header, Icon, IconBtn, Ring, s } from '../ui';
import { call } from '../api';
import { distance, roughInside, useNearby } from '../punch';
import { isWatching, sendAuto } from '../auto';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening'; };
const shiftMs = (me) => {
  const t = (x, d) => { const [h, m] = (x ?? d).split(':').map(Number); return h * 60 + m; };
  return Math.max(60, t(me?.shift_end, '18:00') - t(me?.shift_start, '09:00')) * 60000;
};
const ACT = {
  check_in: ['log-in-outline', C.ok, C.okSoft, 'Check In'], check_out: ['log-out-outline', C.bad, C.badSoft, 'Check Out'],
  break_start: ['cafe-outline', C.warn, C.warnSoft, 'Break Start'], break_end: ['cafe-outline', C.warn, C.warnSoft, 'Break End'],
};

/** 12-hour time with a small AM/PM so it never wraps in the narrow side columns. */
function BigTime({ iso, color }) {
  if (!iso) return <Text style={{ fontFamily: F.xb, fontSize: 20, color }}>--:--</Text>;
  const [t, ap] = new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).split(' ');
  return <Text numberOfLines={1} style={{ fontFamily: F.xb, fontSize: 20, color }}>{t}<Text style={{ fontFamily: F.b, fontSize: 11 }}> {ap ?? ''}</Text></Text>;
}

function Tile({ icon, color, bg, label, value, onPress, active }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [{ flex: 1, backgroundColor: C.card, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginHorizontal: 4, borderWidth: active ? 2 : 0, borderColor: color }, pressed && { opacity: 0.8 }]}>
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}><Icon name={icon} size={24} color={color} /></View>
      <Text style={{ fontFamily: F.sb, fontSize: 12, color: C.ink }}>{label}</Text>
      <Text style={{ fontFamily: F.m, fontSize: 12, color: C.mute, marginTop: 1 }}>{value}</Text>
    </Pressable>
  );
}

export default function Home({ token, user, me, today: t, pending, refresh, refreshing, goTab }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const pos = useNearby(!!me?.site);
  const site = me?.site;
  const checkedIn = !!t?.checked_in;
  const onBreak = !!t?.break_open_since;
  const [autoOn, setAutoOn] = useState(false);
  useEffect(() => { isWatching().then(setAutoOn); }, [site?.id, site?.auto_attendance, checkedIn]);
  // The OS only reports crossing the boundary. If the app is opened while the employee is already inside, check them in now.
  const lastCatch = useRef(0);
  const insideNow = roughInside(site, pos);
  useEffect(() => {
    if (!autoOn || !insideNow || checkedIn || !pos || Date.now() - lastCatch.current < 5 * 60000) return;
    lastCatch.current = Date.now();
    sendAuto(token, 'enter', { coords: { latitude: pos.lat, longitude: pos.lng, accuracy: pos.acc } }).then(() => refresh()).catch(() => {});
  }, [autoOn, insideNow, checkedIn]);

  const live = (t?.gross_ms ?? 0) + (t?.open_since ? now - t.open_since : 0) - (t?.break_ms ?? 0) - (t?.break_open_since ? now - t.break_open_since : 0);
  const worked = Math.max(0, live);
  const breakMs = (t?.break_ms ?? 0) + (t?.break_open_since ? now - t.break_open_since : 0);

  const inside = roughInside(site, pos);
  const away = site?.type === 'circle' && pos ? Math.max(0, Math.round(distance(site, pos) - site.radius_m)) : null;
  const banner = !site ? ['No work site assigned', C.grey, 'alert-circle-outline']
    : inside === null ? ['Finding your location...', C.grey, 'locate-outline']
    : inside ? ['You are inside the work area', C.ok, 'checkmark-circle']
    : [away != null ? `${away} m from the work area` : 'You are outside the work area', C.warn, 'navigate-outline'];

  const toggleBreak = async () => {
    try { await call('POST', onBreak ? '/break/end' : '/break/start', token, {}); await refresh(); }
    catch (e) { Alert.alert('Break', msg(e)); }
  };

  const today = localToday();
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <Header tall title={`${greet()}, ${user.name.split(' ')[0]}!`} subtitle="Have a productive day ahead." right={<IconBtn name="notifications-outline" badge={pending} onPress={() => goTab('reports')} />} />
      <View style={{ paddingHorizontal: 16, marginTop: -58 }}>
        <Card style={{ paddingVertical: 18 }}>
          <Text style={{ fontFamily: F.b, fontSize: 15, color: C.ink }}>Today's Status</Text>
          <Text style={{ fontFamily: F.m, fontSize: 12, color: C.mute }}>{prettyDay(today)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.m, fontSize: 12, color: C.mute }}>Check In</Text>
              <BigTime iso={t?.first_in} color={t?.first_in ? C.ok : C.grey} />
              {t?.status ? <View style={{ marginTop: 6 }}><Chip text={t.status === 'late' ? 'Late' : 'On time'} tone={t.status === 'late' ? 'warn' : 'ok'} /></View> : null}
            </View>
            <Ring size={136} stroke={13} progress={worked / shiftMs(me)} color={onBreak ? C.warn : C.ok}>
              <Text style={{ fontFamily: F.m, fontSize: 11, color: C.mute }}>{onBreak ? 'On break' : 'Working Hours'}</Text>
              <Text style={{ fontFamily: F.xb, fontSize: 24, color: C.ink, fontVariant: ['tabular-nums'] }}>{hms(worked).slice(0, 5)}</Text>
              <Text style={{ fontFamily: F.m, fontSize: 11, color: C.mute }}>{hms(worked).slice(6)} sec</Text>
            </Ring>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: F.m, fontSize: 12, color: C.mute }}>Check Out</Text>
              <BigTime iso={checkedIn ? null : t?.last_out} color={t?.last_out && !checkedIn ? C.bad : C.grey} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: banner[1] + '1F', borderRadius: 12, padding: 10, marginTop: 14 }}>
            <Icon name={banner[2]} size={18} color={banner[1]} />
            <Text style={{ fontFamily: F.sb, fontSize: 12.5, color: banner[1], marginLeft: 8, flex: 1 }}>{site ? `${site.name} · ` : ''}{banner[0]}</Text>
          </View>
          {autoOn ? <View style={[s.row, { marginTop: 8 }]}><Icon name="sync-circle-outline" size={16} color={C.primary} /><Text style={{ fontFamily: F.m, fontSize: 11.5, color: C.mute, marginLeft: 6, flex: 1 }}>Automatic attendance is on: you are checked in when you arrive and out when you leave.</Text></View> : null}
        </Card>

        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 14 }}>
          <Tile icon="log-in-outline" color={C.primary} bg={C.soft} label="Punch In" value={clock(t?.first_in).replace(/^0/, '')} />
          <Tile icon="log-out-outline" color={C.warn} bg={C.warnSoft} label="Punch Out" value={checkedIn ? '--:--' : clock(t?.last_out)} />
          <Tile icon="cafe-outline" color={C.violet} bg={C.violetSoft} label={onBreak ? 'End Break' : 'Break'} value={hm(breakMs)} active={onBreak} onPress={checkedIn ? toggleBreak : () => Alert.alert('Break', 'Check in first to take a break.')} />
          <Tile icon="time-outline" color={C.ok} bg={C.okSoft} label="Total Hours" value={hm(worked)} />
        </View>

        <Card>
          <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={{ fontFamily: F.b, fontSize: 15 }}>Attendance Overview</Text>
            <Pressable onPress={() => goTab('history')}><Text style={{ color: C.primary, fontFamily: F.sb, fontSize: 12.5 }}>View Calendar</Text></Pressable></View>
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            {(t?.week ?? []).map((d) => {
              const isToday = d.day === today;
              const ico = d.status === 'present' || d.status === 'late' ? ['checkmark-circle', d.status === 'late' ? C.warn : C.ok]
                : d.status === 'absent' ? ['close-circle', C.bad] : d.status === 'leave' ? ['airplane', C.violet] : [null];
              return (
                <View key={d.day} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 14, backgroundColor: isToday ? C.soft : 'transparent' }}>
                  <Text style={{ fontFamily: F.m, fontSize: 11, color: C.mute }}>{DOW[parseDay(d.day).getUTCDay()].slice(0, 3)}</Text>
                  <Text style={{ fontFamily: F.b, fontSize: 15, marginVertical: 3 }}>{d.day.slice(8)}</Text>
                  {ico[0] ? <Icon name={ico[0]} size={20} color={ico[1]} /> : <View style={{ height: 20, justifyContent: 'center' }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.line }} /></View>}
                  <Text style={{ fontFamily: F.m, fontSize: 10, color: C.mute, marginTop: 2 }}>{isToday && !d.first_in ? 'Today' : d.first_in ? clock(d.first_in).replace(/^0/, '') : '--'}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        <Card>
          <Text style={{ fontFamily: F.b, fontSize: 15, marginBottom: 12 }}>This Month Summary</Text>
          <View style={{ flexDirection: 'row' }}>
            {[['Present', t?.month?.present ?? 0, C.ok], ['Absent', t?.month?.absent ?? 0, C.bad], ['Late', t?.month?.late ?? 0, C.warn], ['Total Hours', hm(t?.month?.ms ?? 0), C.primary]].map(([l, v, c], i) => (
              <View key={l} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderColor: C.line }}>
                <Text style={{ fontFamily: F.xb, fontSize: 22, color: c }}>{v}</Text><Text style={{ fontFamily: F.m, fontSize: 11.5, color: C.mute }}>{l}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}><Text style={{ fontFamily: F.b, fontSize: 15 }}>Recent Activities</Text>
            <Pressable onPress={() => goTab('history')}><Text style={{ color: C.primary, fontFamily: F.sb, fontSize: 12.5 }}>View All</Text></Pressable></View>
          {(t?.recent ?? []).length === 0 ? <Text style={{ color: C.mute, fontFamily: F.m, paddingVertical: 12 }}>No activity yet. Tap Punch to check in.</Text> : t.recent.map((a, i) => {
            const [ic, col, bg, label] = ACT[a.type];
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: C.line }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={20} color={col} /></View>
                <Text style={{ fontFamily: F.sb, fontSize: 14, flex: 1, marginLeft: 12 }}>{label}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: F.b, fontSize: 13 }}>{clock(a.at)}</Text>
                  <Text style={{ fontFamily: F.m, fontSize: 11, color: C.mute }}>{new Date(a.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}{site ? ` · ${site.name}` : ''}</Text>
                </View>
              </View>
            );
          })}
        </Card>
      </View>
    </ScrollView>
  );
}
