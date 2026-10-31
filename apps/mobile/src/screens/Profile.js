import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Switch, Text, View } from 'react-native';
import { C, F } from '../theme';
import { Avatar, Btn, Card, Header, Icon, s } from '../ui';
import { REASONS, disableAuto, enableAuto, inExpoGo, isWatching } from '../auto';

const Row = ({ icon, label, value }) => (
  <View style={[s.row, { paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line }]}>
    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} color={C.primary} /></View>
    <View style={{ marginLeft: 12, flex: 1 }}><Text style={{ fontFamily: F.m, fontSize: 12, color: C.mute }}>{label}</Text><Text style={{ fontFamily: F.sb, fontSize: 14.5 }}>{value}</Text></View>
  </View>
);

export default function Profile({ user, me, onLogout }) {
  const [auto, setAuto] = useState(false);
  useEffect(() => { isWatching().then(setAuto); }, [me?.site?.id]);
  const toggle = async (on) => {
    if (!on) { await disableAuto(); setAuto(false); return; }
    const r = await enableAuto(me?.site);
    setAuto(r.ok);
    if (!r.ok) Alert.alert('Automatic attendance', REASONS[r.reason] ?? 'Could not turn it on.', r.reason === 'need_always' ? [{ text: 'Open settings', onPress: () => Linking.openSettings() }, { text: 'Cancel' }] : undefined);
  };
  const canAuto = !inExpoGo && me?.site && me.site.auto_attendance !== 0;
  const privacy = [
    'Your location is read when you tap Punch, and, only if you turn on automatic attendance, when the phone crosses the edge of your work area.',
    'Automatic attendance uses the phone\'s own geofence: the app is not tracking you in between and no route is stored.',
    'Stored per punch: time, coordinates, GPS accuracy and your registered device.',
    'The distance on the home screen is worked out on your phone and is never sent anywhere.',
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <Header title="Profile" subtitle={user.label ?? 'Employee'} />
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <Card style={{ alignItems: 'center' }}>
          <Avatar name={user.name} size={72} />
          <Text style={{ fontFamily: F.xb, fontSize: 20, marginTop: 10 }}>{user.name}</Text>
          <Text style={{ fontFamily: F.m, color: C.mute }}>{me?.email}</Text>
        </Card>
        <Card>
          {me?.department ? <Row icon="briefcase-outline" label="Department" value={me.department} /> : null}
          <Row icon="location-outline" label="Work location" value={me?.site?.name ?? 'Not assigned'} />
          <Row icon="time-outline" label="Shift" value={me ? `${me.shift_start} - ${me.shift_end ?? '18:00'}  (grace ${me.grace_min} min)` : '--'} />
          <Row icon="phone-portrait-outline" label="Registered device" value={me?.device_id ? 'Bound to this phone' : 'Not bound yet'} />
          <Row icon="id-card-outline" label="Employee code (kiosk)" value={`#${String(user.id).padStart(5, '0')}`} />
        </Card>
        <Card>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: F.b, fontSize: 15 }}>Automatic attendance</Text>
              <Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.mute, marginTop: 2 }}>
                {canAuto ? 'Check in when you arrive at work and out when you leave, without tapping Punch.' : REASONS[inExpoGo ? 'expo_go' : !me?.site ? 'no_site' : 'site_off']}
              </Text>
            </View>
            <Switch value={auto} onValueChange={toggle} disabled={!canAuto} trackColor={{ true: C.ok }} />
          </View>
        </Card>
        <Card>
          <View style={[s.row, { marginBottom: 6 }]}><Icon name="shield-checkmark" size={20} color={C.ok} /><Text style={{ fontFamily: F.b, fontSize: 15, marginLeft: 8 }}>Your privacy</Text></View>
          {privacy.map((t) => <Text key={t} style={{ fontFamily: F.m, fontSize: 13, color: C.mute, marginVertical: 4, lineHeight: 19 }}>• {t}</Text>)}
        </Card>
        <Btn title="Sign out" icon="log-out-outline" color={C.bad} onPress={onLogout} />
      </View>
    </ScrollView>
  );
}
