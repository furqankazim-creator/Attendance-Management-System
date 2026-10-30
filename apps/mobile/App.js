import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold,
  Poppins_700Bold, Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import './src/auto';
import { C } from './src/theme';
import Login from './src/screens/Login';
import Worker from './src/screens/Worker';
import Staff from './src/screens/Staff';

// Shows the real error on screen instead of Expo's generic "Something went wrong" page.
class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 70 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 10 }}>The app hit an error</Text>
        <Text selectable style={{ color: '#B91C1C', marginBottom: 12 }}>{String(this.state.err?.message ?? this.state.err)}</Text>
        <Text selectable style={{ fontSize: 11, color: '#555' }}>{String(this.state.err?.stack ?? '').slice(0, 1500)}</Text>
      </ScrollView>
    );
  }
}

export default function App() {
  return <Boundary><Main /></Boundary>;
}

function Main() {
  const [fontsReady] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold });
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('session').then((v) => {
      const sess = v ? JSON.parse(v) : null;
      if (sess && sess.user.perms) setSession(sess); // sessions saved before roles existed must sign in again
      setReady(true);
    });
  }, []);
  const login = async (token, user) => {
    const sess = { token, user };
    await AsyncStorage.setItem('session', JSON.stringify(sess));
    setSession(sess);
  };
  const logout = async () => { await AsyncStorage.removeItem('session'); setSession(null); };

  if (!fontsReady || !ready) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator size="large" color={C.primary} /></View>;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style={session ? 'light' : 'light'} />
      {!session ? <Login onLogin={login}
        /> : session.user.role === 'worker' ? <Worker {...session} onLogout={logout} /> : <Staff {...session} onLogout={logout} />}
    </View>
  );
}
