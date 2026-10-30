import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C, F, GRAD, colorFor, initials, shadow } from './theme';

export const TOP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 48;

export const Icon = ({ name, size = 20, color = C.ink, style }) => <Ionicons name={name} size={size} color={color} style={style} />;

export function Card({ children, style }) { return <View style={[s.card, style]}>{children}</View>; }

export function Btn({ title, onPress, disabled, color = C.primary, ghost, icon, style }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, ghost ? { backgroundColor: C.soft } : { backgroundColor: color }, disabled && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }] }, style]}>
      {icon ? <Icon name={icon} size={18} color={ghost ? C.primary : '#fff'} style={{ marginRight: 8 }} /> : null}
      <Text style={[s.btnText, ghost && { color: C.primary }]}>{title}</Text>
    </Pressable>
  );
}

const TONES = { ok: [C.okSoft, '#0B8F63'], warn: [C.warnSoft, '#B36B00'], bad: [C.badSoft, '#D12C2C'], grey: ['#EEF1F7', C.mute], violet: [C.violetSoft, '#6B3FDC'], info: ['#DFF4FE', '#0B7AB0'] };
const TONE_OF = { present: 'ok', late: 'warn', absent: 'bad', leave: 'violet', approved: 'ok', pending: 'warn', submitted: 'warn', rejected: 'bad', in: 'ok', left: 'grey', expected: 'grey', open: 'grey', off: 'grey', low: 'ok', medium: 'warn', high: 'bad' };
export function Chip({ text, tone }) {
  const [bg, fg] = TONES[tone ?? TONE_OF[text] ?? 'grey'];
  return <Text style={[s.chip, { backgroundColor: bg, color: fg }]}>{text}</Text>;
}

export function Avatar({ name, size = 42 }) {
  return (
    <LinearGradient colors={[colorFor(name), colorFor(name + 'x')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: F.xb, fontSize: size * 0.38 }}>{initials(name)}</Text>
    </LinearGradient>
  );
}

/** Circular progress ring. `children` are drawn in the centre. */
export function Ring({ size = 150, stroke = 12, progress = 0, color = C.ok, track = '#E6ECF5', children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const anim = useRef(new Animated.Value(0)).current;
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = anim.addListener(({ value }) => setP(value));
    Animated.timing(anim, { toValue: Math.min(1, Math.max(0, progress)), duration: 900, useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [progress]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} />
      </Svg>
      {children}
    </View>
  );
}

/** Gradient header used by every main screen. */
export function Header({ title, subtitle, right, left, children, tall }) {
  return (
    <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: TOP + 10 }, tall && { paddingBottom: 78 }]}>
      <View style={s.circleA} /><View style={s.circleB} />
      <View style={s.headerRow}>
        {left}
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{title}</Text>
          {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}

export function IconBtn({ name, onPress, badge, color = '#fff' }) {
  return (
    <Pressable onPress={onPress} style={s.iconBtn}>
      <Icon name={name} size={22} color={color} />
      {badge > 0 ? <View style={s.badge}><Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}
    </Pressable>
  );
}

export function Sheet({ visible, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose}><Pressable style={s.sheet} onPress={() => {}}>{children}</Pressable></Pressable>
    </Modal>
  );
}

export const Empty = ({ text }) => <Text style={{ color: C.mute, fontFamily: F.m, textAlign: 'center', paddingVertical: 24 }}>{text}</Text>;

export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 14, ...shadow },
  btn: { flexDirection: 'row', paddingVertical: 15, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginVertical: 5 },
  btnText: { color: '#fff', fontFamily: F.b, fontSize: 15.5 },
  chip: { fontFamily: F.b, fontSize: 11.5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, overflow: 'hidden', textTransform: 'capitalize', alignSelf: 'flex-start' },
  header: { paddingHorizontal: 20, paddingBottom: 26, overflow: 'hidden', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  circleA: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -90, backgroundColor: 'rgba(255,255,255,0.13)' },
  circleB: { position: 'absolute', width: 120, height: 120, borderRadius: 60, right: 110, bottom: -70, backgroundColor: 'rgba(255,255,255,0.09)' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: '#fff', fontFamily: F.xb, fontSize: 22 },
  headerSub: { color: 'rgba(255,255,255,0.88)', fontFamily: F.m, fontSize: 13, marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.bad, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontFamily: F.b, fontSize: 10 },
  scrim: { flex: 1, backgroundColor: 'rgba(8,18,40,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
});
