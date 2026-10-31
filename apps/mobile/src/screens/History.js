import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { C, DOW, F, MONTHS, addDays, clock, hm, localToday, mondayOf, parseDay, prettyDay } from '../theme';
import { Card, Chip, Header, Icon, IconBtn, s } from '../ui';
import { call } from '../api';
import { useLive } from '../useLive';

const EV = {
  check_in: ['log-in-outline', C.ok, 'Check In'], check_out: ['log-out-outline', C.bad, 'Check Out'],
  break_start: ['cafe-outline', C.warn, 'Break Start'], break_end: ['cafe-outline', C.warn, 'Break End'],
};
const DOT = { present: C.ok, late: C.warn, absent: C.bad, leave: C.violet };

export default function History({ token, site }) {
  const today = localToday();
  const [sel, setSel] = useState(today);
  const [month, setMonth] = useState(null);
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState(false);

  const ym = sel.slice(0, 7);
  const load = useCallback(async (opts) => {
    const quiet = opts?.silent === true;
    if (!quiet) setBusy(true);
    try {
      setMonth(await call('GET', `/me/history?month=${ym}`, token));
      setDay(await call('GET', `/me/day?day=${sel}`, token));
    } catch {}
    if (!quiet) setBusy(false);
  }, [ym, sel, token]);
  useEffect(() => { load(); }, [load]);
  useLive(() => load({ silent: true }), 30000);

  const monday = mondayOf(sel);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const info = Object.fromEntries((month?.days ?? []).map((d) => [d.day, d]));
  const [yy, mm] = ym.split('-').map(Number);
  const totals = month?.totals;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />} contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <Header title="Attendance History" subtitle="Your punches, breaks and hours." />
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <Card>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
            <Pressable onPress={() => setSel(addDays(monday, -7))} hitSlop={12}><Icon name="chevron-back" size={22} color={C.mute} /></Pressable>
            <Text style={{ fontFamily: F.b, fontSize: 16 }}>{MONTHS[mm - 1]} {yy}</Text>
            <Pressable onPress={() => setSel(addDays(monday, 7))} hitSlop={12}><Icon name="chevron-forward" size={22} color={C.mute} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {week.map((d) => {
              const on = d === sel;
              const st = info[d]?.status;
              return (
                <Pressable key={d} onPress={() => setSel(d)} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.m, fontSize: 10.5, color: C.mute }}>{DOW[parseDay(d).getUTCDay()]}</Text>
                  <View style={{ width: 40, height: 46, borderRadius: 13, marginTop: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.ok : 'transparent' }}>
                    <Text style={{ fontFamily: F.b, fontSize: 16, color: on ? '#fff' : d > today ? C.grey : C.ink }}>{Number(d.slice(8))}</Text>
                    <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 4, backgroundColor: on ? '#fff' : DOT[st] ?? 'transparent' }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={{ paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row' }}>
            {[['Present', totals?.present ?? 0, C.ok], ['Absent', totals?.absent ?? 0, C.bad], ['Late', totals?.late ?? 0, C.warn], ['Total Hours', hm(totals?.ms ?? 0), C.primary]].map(([l, v, c], i) => (
              <View key={l} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderColor: C.line }}>
                <Text style={{ fontFamily: F.xb, fontSize: 22, color: c }}>{v}</Text><Text style={{ fontFamily: F.m, fontSize: 11.5, color: C.mute }}>{l}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
            <Text style={{ fontFamily: F.b, fontSize: 14.5, flex: 1 }}>{prettyDay(sel)}</Text>
            <Text style={{ fontFamily: F.b, fontSize: 13, color: C.ok }}>Total Hours: {hm(day?.total_ms ?? 0)}</Text>
          </View>
          {(day?.events ?? []).length === 0 ? <Text style={{ color: C.mute, fontFamily: F.m, paddingVertical: 20, textAlign: 'center' }}>{sel > today ? 'This day has not happened yet.' : 'No punches on this day.'}</Text> : (
            <>
              {day.events.map((e, i) => {
                const [ic, col, label] = EV[e.type];
                const last = i === day.events.length - 1;
                return (
                  <View key={i} style={{ flexDirection: 'row', paddingVertical: 8 }}>
                    <View style={{ alignItems: 'center', width: 48 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: col, alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={22} color="#fff" /></View>
                      {!last && <View style={{ position: 'absolute', top: 50, bottom: -12, width: 2, backgroundColor: C.line }} />}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.b, fontSize: 15 }}>{label}</Text>
                      <Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.mute }}>{clock(e.at)}{e.place ? `  ·  ${e.place}` : site ? `  ·  ${site.name}` : ''}</Text>
                    </View>
                    <View style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
                      {e.type === 'check_in' && e.status ? <Chip text={e.status === 'late' ? 'Late' : 'On time'} tone={e.status === 'late' ? 'warn' : 'ok'} /> : null}
                      {e.type === 'break_end' ? <Text style={{ fontFamily: F.sb, fontSize: 12, color: C.mute }}>Duration {hm(e.duration_ms ?? 0)}</Text> : null}
                      {e.pending ? <Chip text="Under review" tone="warn" /> : null}
                      {e.type === 'check_out' && !e.pending ? <Chip text="Done" tone="grey" /> : null}
                    </View>
                  </View>
                );
              })}
              {day.open ? <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}><Icon name="ellipse" size={10} color={C.warn} /><Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.warn, marginLeft: 8 }}>Check-out pending</Text></View> : null}
            </>
          )}
        </Card>
        <Text style={{ fontFamily: F.m, fontSize: 11.5, color: C.mute, textAlign: 'center' }}>Times are shown in your phone's time zone.</Text>
      </View>
    </ScrollView>
  );
}
