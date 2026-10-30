import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, GRAD, clock, msg, shadowOf } from '../theme';
import { Btn, Icon, Sheet } from '../ui';
import { call, flushQueue, queueSize } from '../api';
import { doPunch } from '../punch';
import { syncAuto } from '../auto';
import Home from './Home';
import History from './History';
import Reports from './Reports';
import Profile from './Profile';

const TABS = [['home', 'Home', 'home'], ['history', 'History', 'time'], null, ['reports', 'Reports', 'bar-chart'], ['profile', 'Profile', 'person']];

export default function Worker({ token, user, onLogout }) {
  const [tab, setTab] = useState('home');
  const [me, setMe] = useState(null);
  const [today, setToday] = useState(null);
  const [pending, setPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await flushQueue(token);
      const profile = await call('GET', '/me', token);
      setMe(profile);
      syncAuto(profile.site).catch(() => {});
      setToday(await call('GET', '/me/today', token));
    } catch {}
    setPending(await queueSize());
    setRefreshing(false);
  }, [token]);
  useEffect(() => { refresh(); const i = setInterval(refresh, 60000); return () => clearInterval(i); }, [refresh]);

  const checkedIn = !!today?.checked_in;
  const punch = async () => {
    const kind = checkedIn ? 'out' : 'in';
    setBusy(true);
    try {
      const r = await doPunch(token, kind);
      setResult(r.offline
        ? { ok: true, icon: 'cloud-offline-outline', title: 'Saved offline', text: 'It will sync automatically when you are back online.' }
        : { ok: true, icon: kind === 'in' ? 'log-in-outline' : 'log-out-outline', title: kind === 'in' ? 'Checked in' : 'Checked out', text: r.review === 'pending' ? 'Sent for supervisor review.' : r.status ? (r.status === 'late' ? 'You arrived late today.' : 'You are on time. Have a great day!') : `Recorded at ${clock(new Date().toISOString())}.` });
      await refresh();
    } catch (e) { setResult({ ok: false, icon: 'close-circle-outline', title: 'Not recorded', text: msg(e) }); }
    setBusy(false);
  };

  const props = { token, user, me, today, pending, refresh, refreshing, goTab: setTab, site: me?.site, onLogout };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' && <Home {...props} />}
        {tab === 'history' && <History {...props} />}
        {tab === 'reports' && <Reports {...props} />}
        {tab === 'profile' && <Profile {...props} />}
      </View>

      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 16, paddingTop: 30 }}>
        <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 26, height: 68, alignItems: 'center', ...shadowOf(0.2) }}>
          {TABS.map((t, i) => t ? (
            <Pressable key={t[0]} onPress={() => setTab(t[0])} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
              <Icon name={tab === t[0] ? t[2] : `${t[2]}-outline`} size={24} color={tab === t[0] ? C.ok : C.grey} />
              <Text style={{ fontFamily: tab === t[0] ? F.b : F.m, fontSize: 11, color: tab === t[0] ? C.ok : C.grey, marginTop: 2 }}>{t[1]}</Text>
            </Pressable>
          ) : <View key={i} style={{ flex: 1.1 }} />)}
        </View>
        <Pressable onPress={punch} disabled={busy || !me?.site} hitSlop={8} style={({ pressed }) => ({ position: 'absolute', alignSelf: 'center', top: 0, paddingBottom: 16, zIndex: 10, elevation: 20, opacity: !me?.site ? 0.5 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <LinearGradient colors={checkedIn ? ['#F97316', '#EF4444'] : GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: C.bg, ...shadowOf(0.35, 16, 8) }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Icon name="finger-print" size={36} color="#fff" />}
          </LinearGradient>
          <Text style={{ textAlign: 'center', fontFamily: F.b, fontSize: 11, color: checkedIn ? C.bad : C.ok, position: 'absolute', bottom: 0, alignSelf: 'center' }}>{checkedIn ? 'Check out' : 'Punch'}</Text>
        </Pressable>
      </View>

      <Sheet visible={!!result} onClose={() => setResult(null)}>
        {result && (
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: result.ok ? C.okSoft : C.badSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name={result.icon} size={44} color={result.ok ? C.ok : C.bad} />
            </View>
            <Text style={{ fontFamily: F.xb, fontSize: 22 }}>{result.title}</Text>
            <Text style={{ fontFamily: F.m, fontSize: 14.5, color: C.mute, textAlign: 'center', marginTop: 6, marginBottom: 14 }}>{result.text}</Text>
            <Btn title="Done" onPress={() => setResult(null)} color={result.ok ? C.ok : C.bad} style={{ alignSelf: 'stretch' }} />
          </View>
        )}
      </Sheet>
    </View>
  );
}
