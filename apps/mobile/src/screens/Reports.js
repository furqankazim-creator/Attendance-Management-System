import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { C, F, addDays, hm, localToday, mondayOf, msg, parseDay } from '../theme';
import { Btn, Card, Chip, Empty, Header, Icon, s } from '../ui';
import { call } from '../api';
import { useLive } from '../useLive';

const field = { backgroundColor: C.bg, borderRadius: 12, padding: 13, fontFamily: F.m, fontSize: 14.5, color: C.ink, marginBottom: 10 };

function Seg({ items, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.soft, borderRadius: 14, padding: 4, marginBottom: 14 }}>
      {items.map((i) => (
        <Pressable key={i} onPress={() => onChange(i)} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11, backgroundColor: value === i ? C.card : 'transparent' }}>
          <Text style={{ fontFamily: F.b, fontSize: 13.5, color: value === i ? C.primary : C.mute }}>{i}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Timesheet({ token }) {
  const [start, setStart] = useState(mondayOf(localToday()));
  const [data, setData] = useState(null);
  const load = useCallback(async (opts) => { try { setData(await call('GET', `/timesheets/week?start=${start}`, token)); } catch { if (opts?.silent !== true) setData(null); } }, [start, token]);
  useEffect(() => { load(); }, [load]);
  useLive(() => load({ silent: true }), 30000);
  const submit = async () => {
    try { await call('POST', '/timesheets/submit', token, { week_start: start }); Alert.alert('Submitted', 'Your supervisor will review this week.'); load(); }
    catch (e) { Alert.alert('Could not submit', msg(e)); }
  };
  const canSubmit = data && (data.state === 'open' || data.state === 'rejected') && start <= localToday();
  return (
    <>
      <Card style={{ paddingVertical: 12 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Pressable onPress={() => setStart(addDays(start, -7))} hitSlop={12}><Icon name="chevron-back" size={22} color={C.mute} /></Pressable>
          <Text style={{ fontFamily: F.b, fontSize: 15 }}>Week of {start}</Text>
          <Pressable onPress={() => setStart(addDays(start, 7))} hitSlop={12}><Icon name="chevron-forward" size={22} color={C.mute} /></Pressable>
        </View>
      </Card>
      {!data ? <Empty text="Could not load this week." /> : (
        <Card>
          {data.days.map((d) => (
            <View key={d.day} style={[s.row, { justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderColor: C.line }]}>
              <Text style={{ fontFamily: F.sb, fontSize: 14 }}>{parseDay(d.day).toUTCString().slice(0, 11)}</Text>
              <Text style={{ fontFamily: F.b, fontSize: 14, color: d.ms ? C.ink : C.grey }}>{d.ms ? hm(d.ms) : '--:--'}</Text>
            </View>
          ))}
          <View style={[s.row, { justifyContent: 'space-between', paddingTop: 12 }]}>
            <Text style={{ fontFamily: F.xb, fontSize: 15 }}>Total (after breaks)</Text><Text style={{ fontFamily: F.xb, fontSize: 18, color: C.primary }}>{hm(data.total_ms)}</Text>
          </View>
          <View style={[s.row, { justifyContent: 'space-between', marginTop: 12 }]}>
            <Text style={{ fontFamily: F.m, color: C.mute }}>Status</Text><Chip text={data.state === 'open' ? 'Not submitted' : data.state} tone={data.state === 'open' ? 'grey' : undefined} />
          </View>
          {data.state === 'rejected' && data.note ? <Text style={{ fontFamily: F.sb, color: C.bad, marginTop: 8 }}>Note: {data.note}</Text> : null}
          <Btn title="Submit week for approval" icon="send-outline" onPress={submit} disabled={!canSubmit} style={{ marginTop: 14 }} />
        </Card>
      )}
    </>
  );
}

function Requests({ token }) {
  const [mode, setMode] = useState('Leave');
  const [list, setList] = useState([]);
  const [leave, setLeave] = useState({ from_day: '', to_day: '', type: 'casual', reason: '' });
  const [corr, setCorr] = useState({ day: '', kind: 'out', requested_time: '', reason: '' });
  const load = useCallback(async () => { try { setList(await call('GET', mode === 'Leave' ? '/leaves' : '/corrections', token)); } catch {} }, [mode, token]);
  useEffect(() => { load(); }, [load]);
  useLive(load, 30000);
  const send = async () => {
    try {
      if (mode === 'Leave') { await call('POST', '/leaves', token, leave); setLeave({ from_day: '', to_day: '', type: 'casual', reason: '' }); }
      else { await call('POST', '/corrections', token, corr); setCorr({ day: '', kind: 'out', requested_time: '', reason: '' }); }
      Alert.alert('Sent', 'Your supervisor will review it.'); load();
    } catch (e) { Alert.alert('Could not send', msg(e)); }
  };
  const types = ['casual', 'sick', 'annual'];
  return (
    <>
      <Seg items={['Leave', 'Correction']} value={mode} onChange={setMode} />
      <Card>
        {mode === 'Leave' ? (
          <>
            <TextInput style={field} placeholder="From (YYYY-MM-DD)" placeholderTextColor={C.grey} value={leave.from_day} onChangeText={(v) => setLeave({ ...leave, from_day: v })} />
            <TextInput style={field} placeholder="To (YYYY-MM-DD)" placeholderTextColor={C.grey} value={leave.to_day} onChangeText={(v) => setLeave({ ...leave, to_day: v })} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {types.map((t) => <Pressable key={t} onPress={() => setLeave({ ...leave, type: t })} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, backgroundColor: leave.type === t ? C.primary : C.soft }}><Text style={{ fontFamily: F.b, textTransform: 'capitalize', color: leave.type === t ? '#fff' : C.primary }}>{t}</Text></Pressable>)}
            </View>
          </>
        ) : (
          <>
            <TextInput style={field} placeholder="Date (YYYY-MM-DD)" placeholderTextColor={C.grey} value={corr.day} onChangeText={(v) => setCorr({ ...corr, day: v })} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {['in', 'out'].map((k) => <Pressable key={k} onPress={() => setCorr({ ...corr, kind: k })} style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, backgroundColor: corr.kind === k ? C.primary : C.soft }}><Text style={{ fontFamily: F.b, color: corr.kind === k ? '#fff' : C.primary }}>Check {k}</Text></Pressable>)}
            </View>
            <TextInput style={field} placeholder="Correct time (HH:MM)" placeholderTextColor={C.grey} value={corr.requested_time} onChangeText={(v) => setCorr({ ...corr, requested_time: v })} />
          </>
        )}
        <TextInput style={[field, { height: 70, textAlignVertical: 'top' }]} multiline placeholder="Reason" placeholderTextColor={C.grey} value={(mode === 'Leave' ? leave : corr).reason} onChangeText={(v) => (mode === 'Leave' ? setLeave({ ...leave, reason: v }) : setCorr({ ...corr, reason: v }))} />
        <Btn title="Send request" icon="paper-plane-outline" onPress={send} />
      </Card>
      <Text style={{ fontFamily: F.b, fontSize: 15, marginBottom: 8 }}>My requests</Text>
      {list.length === 0 ? <Empty text="No requests yet." /> : list.map((r) => (
        <Card key={mode + r.id} style={{ paddingVertical: 12 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontFamily: F.b, fontSize: 14 }}>{mode === 'Leave' ? `${r.from_day} to ${r.to_day}` : `Check ${r.kind} ${r.requested_time} · ${r.day}`}</Text>
              <Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.mute }}>{r.reason || (mode === 'Leave' ? r.type : '')}</Text>
            </View>
            <Chip text={r.state} />
          </View>
        </Card>
      ))}
    </>
  );
}

export default function Reports({ token }) {
  const [tab, setTab] = useState('Timesheet');
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <Header title="Reports" subtitle="Timesheets and requests." />
      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <Seg items={['Timesheet', 'Requests']} value={tab} onChange={setTab} />
        {tab === 'Timesheet' ? <Timesheet token={token} /> : <Requests token={token} />}
      </View>
    </ScrollView>
  );
}
