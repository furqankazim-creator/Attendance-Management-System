import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { C, F, hm, msg, shadowOf } from '../theme';
import { Avatar, Btn, Card, Chip, Empty, Header, Icon, IconBtn, Ring, s } from '../ui';
import { call } from '../api';
import { useLive } from '../useLive';

const TABS = [['dash', 'Dashboard', 'grid'], ['team', 'Team', 'people'], ['approve', 'Approvals', 'checkmark-done'], ['me', 'Profile', 'person']];
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);
const TONE = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.info };

export default function Staff({ token, user, onLogout }) {
  const [tab, setTab] = useState('dash');
  const [d, setD] = useState(null);
  const [board, setBoard] = useState([]);
  const [review, setReview] = useState([]);
  const [corr, setCorr] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState({ items: [], unseen: 0 });
  const canDecide = !!user.perms?.includes('approve.write');

  const load = useCallback(async (opts) => {
    const quiet = opts?.silent === true;
    if (!quiet) setBusy(true);
    try {
      setD(await call('GET', '/dashboard', token));
      setBoard(await call('GET', '/board', token));
      setAlerts(await call('GET', '/alerts', token).catch(() => ({ items: [], unseen: 0 })));
      setReview(await call('GET', '/punches/review', token));
      setCorr((await call('GET', '/corrections', token)).filter((c) => c.state === 'pending'));
      setLeaves((await call('GET', '/leaves', token)).filter((c) => c.state === 'pending'));
    } catch (e) { if (!quiet) Alert.alert('Error', msg(e)); }
    if (!quiet) setBusy(false);
  }, [token]);
  useLive(() => load({ silent: true }), 15000);
  const decide = async (path, decision) => { try { await call('POST', path, token, { decision }); load(); } catch (e) { Alert.alert('Error', msg(e)); } };
  const todo = review.length + corr.length + leaves.length;
  const markSeen = async () => { try { await call('POST', '/alerts/seen', token, {}); setAlerts((a) => ({ ...a, unseen: 0, items: a.items.map((x) => ({ ...x, seen: true })) })); } catch (e) { Alert.alert('Error', msg(e)); } };
  const o = d?.overview;

  const Decide = ({ path }) => !canDecide ? null : (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      <Btn title="Approve" color={C.ok} onPress={() => decide(path, 'approved')} style={{ flex: 1, marginVertical: 0, paddingVertical: 11 }} />
      <Btn title="Reject" color={C.bad} onPress={() => decide(path, 'rejected')} style={{ flex: 1, marginVertical: 0, paddingVertical: 11 }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Header title={tab === 'dash' ? `Hi, ${user.name.split(' ')[0]}` : TABS.find((t) => t[0] === tab)[1]} subtitle={tab === 'dash' ? `${user.label ?? 'Staff'} dashboard` : undefined}
          right={<IconBtn name="notifications-outline" badge={todo + alerts.unseen} onPress={() => setTab(todo === 0 && alerts.unseen > 0 ? 'dash' : 'approve')} />} />
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          {tab === 'dash' && (!o ? <Empty text="Loading..." /> : (
            <>
              <Card>
                <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                  <View style={s.row}><Icon name="shield-checkmark-outline" size={18} color={C.warn} /><Text style={{ fontFamily: F.b, fontSize: 15, marginLeft: 8 }}>On-duty alerts{alerts.unseen ? ` (${alerts.unseen} new)` : ''}</Text></View>
                  {alerts.unseen > 0 && canDecide ? <Pressable onPress={markSeen} hitSlop={8}><Text style={{ fontFamily: F.sb, fontSize: 12.5, color: C.primary }}>Mark all seen</Text></Pressable> : null}
                </View>
                {alerts.items.length === 0 ? <Empty text="No one has left the work area during a shift." /> : alerts.items.slice(0, 6).map((a, i) => (
                  <View key={a.id} style={[s.row, { paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: C.line, alignItems: 'flex-start', opacity: a.seen ? 0.6 : 1 }]}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: TONE[a.tone] ?? C.info, marginTop: 6, marginRight: 10 }} />
                    <View style={{ flex: 1 }}><Text style={{ fontFamily: a.seen ? F.m : F.sb, fontSize: 13.5 }}>{a.text}</Text>
                      <Text style={{ fontFamily: F.m, fontSize: 11.5, color: C.mute }}>{new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text></View>
                  </View>
                ))}
              </Card>
              <Card>
                <Text style={{ fontFamily: F.b, fontSize: 15, marginBottom: 8 }}>Today's overview</Text>
                <View style={[s.row, { justifyContent: 'space-around' }]}>
                  <Ring size={130} stroke={13} progress={o.total ? o.present / o.total : 0}>
                    <Text style={{ fontFamily: F.xb, fontSize: 26 }}>{pct(o.present, o.total)}%</Text><Text style={{ fontFamily: F.m, fontSize: 11, color: C.mute }}>present</Text>
                  </Ring>
                  <View>
                    {[['Total', o.total, C.ink], ['Present', o.present, C.ok], ['Absent', o.absent, C.bad], ['On leave', o.leave, C.violet], ['Late', o.late, C.warn]].map(([l, v, c]) => (
                      <View key={l} style={[s.row, { justifyContent: 'space-between', width: 130, paddingVertical: 3 }]}>
                        <View style={s.row}><View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c, marginRight: 8 }} /><Text style={{ fontFamily: F.m, fontSize: 13 }}>{l}</Text></View>
                        <Text style={{ fontFamily: F.xb, fontSize: 14 }}>{v}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.mute, marginTop: 12 }}>Average worked time today: <Text style={{ fontFamily: F.b, color: C.ink }}>{hm(o.avg_ms)}</Text></Text>
              </Card>
              <Card>
                <Text style={{ fontFamily: F.b, fontSize: 15, marginBottom: 6 }}>Departments</Text>
                {d.departments.length === 0 ? <Empty text="No employees yet." /> : d.departments.map((x, i) => (
                  <View key={x.department} style={[s.row, { justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: C.line }]}>
                    <Text style={{ fontFamily: F.sb, fontSize: 14, color: C.primary }}>{x.department}</Text>
                    <Text style={{ fontFamily: F.m, fontSize: 13 }}>{x.present}/{x.total} present · {x.late} late</Text>
                  </View>
                ))}
              </Card>
              <Card>
                <Text style={{ fontFamily: F.b, fontSize: 15, marginBottom: 6 }}>Live activity</Text>
                {d.feed.length === 0 ? <Empty text="No activity yet." /> : d.feed.slice(0, 6).map((f, i) => (
                  <View key={i} style={[s.row, { paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderColor: C.line, alignItems: 'flex-start' }]}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: TONE[f.tone], marginTop: 6, marginRight: 10 }} />
                    <View style={{ flex: 1 }}><Text style={{ fontFamily: F.sb, fontSize: 13.5 }}>{f.text}</Text>
                      <Text style={{ fontFamily: F.m, fontSize: 11.5, color: C.mute }}>{new Date(f.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text></View>
                  </View>
                ))}
              </Card>
            </>
          ))}

          {tab === 'team' && (board.length === 0 ? <Empty text="No employees yet. Add them in the web dashboard." /> : board.map((w) => (
            <Card key={w.id} style={{ paddingVertical: 12 }}>
              <View style={s.row}>
                <Avatar name={w.name} size={46} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontFamily: F.b, fontSize: 15 }}>{w.name}</Text>
                  <Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.mute }}>{w.department} · {w.first_in ? `In at ${new Date(w.first_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No punch today'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}><Chip text={w.state} />{w.status ? <Chip text={w.status} /> : null}</View>
              </View>
            </Card>
          )))}

          {tab === 'approve' && (
            <>
              {todo === 0 && <Empty text="Nothing is waiting for you." />}
              {review.map((p) => (
                <Card key={'p' + p.id}>
                  <View style={s.row}><Icon name="shield-half-outline" size={20} color={C.bad} /><Text style={{ fontFamily: F.b, fontSize: 15, marginLeft: 8 }}>High-risk punch · {p.name}</Text></View>
                  <Text style={{ fontFamily: F.m, color: C.mute, marginTop: 4 }}>{new Date(p.server_ts).toLocaleString()}</Text>
                  <Text style={{ fontFamily: F.sb, fontSize: 12.5, color: C.bad, marginTop: 2 }}>{JSON.parse(p.risk_reasons).join(', ').replaceAll('_', ' ')}</Text>
                  <Decide path={`/punches/${p.id}/review`} />
                </Card>
              ))}
              {corr.map((c) => (
                <Card key={'c' + c.id}>
                  <View style={s.row}><Icon name="create-outline" size={20} color={C.primary} /><Text style={{ fontFamily: F.b, fontSize: 15, marginLeft: 8 }}>Correction · {c.name}</Text></View>
                  <Text style={{ fontFamily: F.m, color: C.mute, marginTop: 4 }}>Check {c.kind} at {c.requested_time} on {c.day}</Text>
                  <Text style={{ fontFamily: F.m, fontSize: 12.5 }}>{c.reason}</Text>
                  <Decide path={`/corrections/${c.id}/decision`} />
                </Card>
              ))}
              {leaves.map((l) => (
                <Card key={'l' + l.id}>
                  <View style={s.row}><Icon name="airplane-outline" size={20} color={C.violet} /><Text style={{ fontFamily: F.b, fontSize: 15, marginLeft: 8 }}>Leave · {l.name}</Text></View>
                  <Text style={{ fontFamily: F.m, color: C.mute, marginTop: 4 }}>{l.from_day} to {l.to_day} ({l.type})</Text>
                  <Text style={{ fontFamily: F.m, fontSize: 12.5 }}>{l.reason}</Text>
                  <Decide path={`/leaves/${l.id}/decision`} />
                </Card>
              ))}
              {!canDecide && todo > 0 && <Text style={{ fontFamily: F.m, fontSize: 12, color: C.mute, textAlign: 'center' }}>Your role has read-only access.</Text>}
            </>
          )}

          {tab === 'me' && (
            <>
              <Card style={{ alignItems: 'center' }}><Avatar name={user.name} size={72} /><Text style={{ fontFamily: F.xb, fontSize: 20, marginTop: 10 }}>{user.name}</Text><Chip text={user.label ?? 'Staff'} tone="info" /></Card>
              <Text style={{ fontFamily: F.m, fontSize: 12.5, color: C.mute, textAlign: 'center', marginBottom: 12 }}>Draw locations, manage employees and view reports in the web dashboard.</Text>
              <Btn title="Sign out" icon="log-out-outline" color={C.bad} onPress={onLogout} />
            </>
          )}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 16, flexDirection: 'row', backgroundColor: C.card, borderRadius: 26, height: 68, alignItems: 'center', ...shadowOf(0.2) }}>
        {TABS.map(([k, label, ic]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
            <View>
              <Icon name={tab === k ? ic : `${ic}-outline`} size={24} color={tab === k ? C.ok : C.grey} />
              {k === 'approve' && todo > 0 ? <View style={[{ position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.bad, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#fff', fontFamily: F.b, fontSize: 10 }}>{todo}</Text></View> : null}
            </View>
            <Text style={{ fontFamily: tab === k ? F.b : F.m, fontSize: 11, color: tab === k ? C.ok : C.grey, marginTop: 2 }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
