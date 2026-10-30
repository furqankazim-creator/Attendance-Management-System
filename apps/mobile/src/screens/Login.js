import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, GRAD, msg, shadowOf } from '../theme';
import { Btn, Icon, TOP } from '../ui';
import { call, deviceId } from '../api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await call('POST', '/auth/login', null, { email: email.trim(), password, device_id: await deviceId() });
      onLogin(r.token, r.user);
    } catch (e) { Alert.alert('Sign in failed', msg(e)); }
    setBusy(false);
  };
  const box = { backgroundColor: C.bg, borderRadius: 14, padding: 14, fontFamily: F.m, fontSize: 15, color: C.ink };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: TOP + 40, paddingBottom: 90, paddingHorizontal: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}><Icon name="location" size={30} color="#fff" /></View>
          <Text style={{ color: '#fff', fontFamily: F.xb, fontSize: 30 }}>GeoWork</Text>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontFamily: F.m, fontSize: 15, marginTop: 4 }}>Attendance that knows where you are.</Text>
        </LinearGradient>
        <View style={{ marginTop: -50, marginHorizontal: 20, backgroundColor: C.card, borderRadius: 24, padding: 20, ...shadowOf(0.15, 20, 8) }}>
          <Text style={{ fontFamily: F.xb, fontSize: 20, marginBottom: 4 }}>Welcome back</Text>
          <Text style={{ fontFamily: F.m, color: C.mute, marginBottom: 16 }}>Sign in with the account your admin created.</Text>
          <TextInput style={[box, { marginBottom: 12 }]} placeholder="Email" placeholderTextColor={C.grey} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <View>
            <TextInput style={box} placeholder="Password" placeholderTextColor={C.grey} secureTextEntry={!show} value={password} onChangeText={setPassword} />
            <Pressable onPress={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: 13 }}><Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.mute} /></Pressable>
          </View>
          <Btn title={busy ? 'Signing in...' : 'Sign in'} onPress={go} disabled={busy || !email || !password} style={{ marginTop: 18 }} />
        </View>
        <Text style={{ textAlign: 'center', fontFamily: F.m, fontSize: 12, color: C.mute, margin: 24 }}>Location is read only when you tap Punch, never in between.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
