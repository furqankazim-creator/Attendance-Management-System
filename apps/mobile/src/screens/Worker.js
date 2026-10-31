import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, GRAD, clock, msg, shadowOf } from '../theme';
import { Btn, Icon, Sheet } from '../ui';
import { call, flushQueue, queueSize } from '../api';
import { doPunch } from '../punch';
import { REASONS, askedBefore, autoWanted, enableAuto, inExpoGo, markAsked, syncAuto } from '../auto';
import { useLive } from '../useLive';
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
  const [alerts, setAlerts] = useState({ items: [], unseen: 0 });
  const [showAlerts, setShowAlerts] = useState(false);
  const [offerAuto, setOfferAuto] = useState(false);

  // refresh({ silent: true }) is the background update: no pull-to-refresh spinner.
  const refresh = useCallback(async (opts) => {
    const quiet = opts?.silent === true;
    if (!quiet) setRefreshing(true);
    try {
      await flushQueue(token);
      const profile = await call('GET', '/me', token);
      setMe(profile);
      syncAuto(profile.site).catch(() => {});
      setToday(await call('GET', '/me/today', token));
      setAlerts(await call('GET', '/me/alerts', token).catch(() => ({ items: [], unseen: 0 })));
    } catch {}
    setPending(await queueSize());
    if (!quiet) setRefreshing(false);
  }, [token]);
  useLive(() => refresh({ silent: true }), 15000);

  // First login: offer automatic attendance once, if this phone and this work location can do it.
  useEffect(() => {
    const site = me?.site;
    if (!site || site.auto_attendance === 0 || inExpoGo) return;
    (async () => { if (!(await askedBefore(user.id)) && !(await autoWanted())) setOfferAuto(true); })();
  }, [me?.site?.id]);
  const answerOffer = async (yes) => {
    setOfferAuto(false);
    await markAsked(user.id);
    if (!yes) return;
    const r = await enableAuto(me.site);
    if (r.ok) setResult({ ok: true, icon: 'navigate-circle-outline', title: 'Automatic attendance is on', text: 'You will be checked in when you arrive at work and out when you leave. You can switch it off in Profile.' });
    else Alert.alert('Automatic attendance', REASONS[r.reason] ?? 'Could not turn it on.', r.reason === 'need_always' ? [{ text: 'Open settings', onPress: () => Linking.openSettings() }, { text: 'Later' }] : undefined);
  };

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

  const openAlerts = () => {
    setShowAlerts(true);
    if (alerts.unseen) call('POST', '/me/alerts/seen', token, {}).then(() => setAlerts((a) => ({ ...a, unseen: 0 }))).catch(() => {});
  };
  const props = { token, user, me, today, pending, alerts, openAlerts, refresh, refreshing, goTab: setTab, site: me?.site, onLogout };
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

      <Sheet visible={offerAuto} onClose={() => answerOffer(false)}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.okSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Icon name="navigate-circle-outline" size={44} color={C.ok} />
          </View>
          <Text style={{ fontFamily: F.xb, fontSize: 21, textAlign: 'center' }}>Check in automatically?</Text>
          <Text style={{ fontFamily: F.m, fontSize: 14.5, color: C.mute, textAlign: 'center', marginTop: 8 }}>
            When you arrive at {me?.site?.name ?? 'work'} you are checked in, and when you leave you are checked out, without tapping Punch.
          </Text>
          <Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.mute, textAlign: 'center', marginTop: 8, marginBottom: 14 }}>
            Your phone only tells the app when you cross the edge of the work area. No route is recorded. Choose "Allow all the time" for location when asked.
          </Text>
          <Btn title="Turn on" onPress={() => answerOffer(true)} color={C.ok} style={{ alignSelf: 'stretch' }} />
          <Pressable onPress={() => answerOffer(false)} hitSlop={10} style={{ paddingVertical: 12 }}><Text style={{ fontFamily: F.sb, color: C.mute }}>Not now</Text></Pressable>
        </View>
      </Sheet>

      <Sheet visible={showAlerts} onClose={() => setShowAlerts(false)}>
        <Text style={{ fontFamily: F.xb, fontSize: 20, marginBottom: 10 }}>Notifications</Text>
        {pending > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
            <Icon name="cloud-offline-outline" size={20} color={C.warn} />
            <Text style={{ fontFamily: F.m, fontSize: 13.5, marginLeft: 10, flex: 1 }}>{pending} punch{pending > 1 ? 'es are' : ' is'} waiting for internet and will sync automatically.</Text>
          </View>
        )}
        {alerts.items.length === 0 && pending === 0 && <Text style={{ fontFamily: F.m, color: C.mute, textAlign: 'center', paddingVertical: 24 }}>Nothing new. You will see reminders here, for example if you are outside the work area during your shift.</Text>}
        {alerts.items.slice(0, 8).map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderColor: C.line }}>
            <Icon name={a.type === 'auto_closed' ? 'time-outline' : 'walk-outline'} size={20} color={a.tone === 'bad' ? C.bad : C.warn} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontFamily: F.sb, fontSize: 13.5 }}>{a.text}</Text>
              <Text style={{ fontFamily: F.m, fontSize: 11.5, color: C.mute, marginTop: 2 }}>{new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          </View>
        ))}
        <Btn title="Close" onPress={() => setShowAlerts(false)} color={C.primary} style={{ alignSelf: 'stretch', marginTop: 12 }} />
      </Sheet>

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
