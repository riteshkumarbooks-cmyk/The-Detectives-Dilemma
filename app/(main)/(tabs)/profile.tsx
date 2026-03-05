import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { signOut } from '@/services/auth';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CharacterProfile {
  firstName: string; lastName: string;
  gender: string;    age: string;
  sexualPreference: string;
  casesWon: number;  wrongGuesses: number;
}
interface Relationship {
  npcId:  string;
  name:   string;
  role:   string;
  value:  number;   // -100 to +100
  status: 'Romance' | 'Friend' | 'Enemy' | 'Neutral';
}

// ── Default NPCs seeded on first load ─────────────────────────────────────────
const DEFAULT_RELATIONSHIPS: Relationship[] = [
  { npcId: 'duchess-margaux',   name: 'Duchess Margaux de Valois', role: 'Client',          value:  10, status: 'Neutral' },
  { npcId: 'marcus-webb',       name: 'Marcus Webb',               role: 'Rival Detective', value:   0, status: 'Neutral' },
  { npcId: 'luna',              name: 'Luna',                      role: 'Informant Cat',   value:  30, status: 'Friend'  },
  { npcId: 'commissioner-hayes',name: 'Commissioner Hayes',        role: 'Superior',        value:   0, status: 'Neutral' },
  { npcId: 'victoria-cross',    name: 'Victoria Cross',            role: 'Suspect',         value: -40, status: 'Enemy'   },
];

// ── Rank helper ───────────────────────────────────────────────────────────────
function getRank(won: number, wrong: number): string {
  if (won >= 20 && wrong < 3)  return 'Master Detective';
  if (won >= 10 && wrong < 5)  return 'Chief Inspector';
  if (won >= 5)                return 'Inspector';
  if (won >= 1)                return 'Detective';
  return 'Novice';
}

// ── Relationship colour ───────────────────────────────────────────────────────
function statusColor(status: Relationship['status']): string {
  switch (status) {
    case 'Romance': return '#E879A0';
    case 'Friend':  return '#4ADE80';
    case 'Enemy':   return Colors.danger;
    default:        return Colors.textMuted;
  }
}

function RelationshipBar({ value }: { value: number }) {
  const pct  = (value + 100) / 200; // 0..1
  const fill = value > 0 ? '#4ADE80' : value < 0 ? Colors.danger : Colors.textMuted;
  return (
    <View style={barStyles.track}>
      <View style={[barStyles.fill, { width: `${pct * 100}%` as any, backgroundColor: fill }]} />
      <View style={barStyles.midLine} />
    </View>
  );
}
const barStyles = StyleSheet.create({
  track:   { height: 6, backgroundColor: Colors.surfaceElevated, borderRadius: 3, overflow: 'hidden', position: 'relative', flex: 1 },
  fill:    { position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 3 },
  midLine: { position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', backgroundColor: Colors.border },
});

// ── Screen ────────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user } = useAuth();
  const router   = useRouter();
  const profileKey = `character_${user?.uid}`;

  const [profile,       setProfile]       = useState<CharacterProfile | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    // Load profile
    AsyncStorage.getItem(profileKey).then(data => {
      if (data) setProfile(JSON.parse(data));
    });
    // Load / seed relationships from Firestore
    getDoc(doc(db, 'users', user.uid)).then(async snap => {
      const remote = snap.data()?.relationships as Relationship[] | undefined;
      if (remote && remote.length > 0) {
        setRelationships(remote);
      } else {
        // First time — seed defaults
        await setDoc(
          doc(db, 'users', user.uid),
          { relationships: DEFAULT_RELATIONSHIPS, updatedAt: serverTimestamp() },
          { merge: true },
        );
        setRelationships(DEFAULT_RELATIONSHIPS);
      }
    });
  }, [user?.uid]);

  const rank = profile ? getRank(profile.casesWon, profile.wrongGuesses) : 'Novice';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Detective card ── */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>DETECTIVE</Text>
          <Text style={styles.detectiveName}>
            {profile ? `${profile.firstName} ${profile.lastName}` : '—'}
          </Text>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>

          <View style={styles.statsRow}>
            <StatPill label="Cases Solved"  value={String(profile?.casesWon     ?? 0)} />
            <StatPill label="Wrong Guesses" value={String(profile?.wrongGuesses ?? 0)} />
            <StatPill label="Age"           value={profile?.age ?? '—'}               />
            <StatPill label="Gender"        value={profile?.gender ?? '—'}            />
          </View>
        </View>

        {/* ── Relationship matrix ── */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>RELATIONSHIPS</Text>
          {relationships.map(r => (
            <View key={r.npcId} style={styles.npcRow}>
              <View style={styles.npcInfo}>
                <Text style={styles.npcName}>{r.name}</Text>
                <Text style={styles.npcRole}>{r.role}</Text>
              </View>
              <View style={styles.npcRight}>
                <RelationshipBar value={r.value} />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusText, { color: statusColor(r.status) }]}>
                    {r.status}
                  </Text>
                  <Text style={styles.valueText}>
                    {r.value > 0 ? `+${r.value}` : r.value}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* ── Account ── */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={() =>
              Alert.alert('Sign Out', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
              ])
            }
          >
            <Text style={styles.dangerBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={pillStyles.pill}>
      <Text style={pillStyles.value}>{value}</Text>
      <Text style={pillStyles.label}>{label}</Text>
    </View>
  );
}
const pillStyles = StyleSheet.create({
  pill:  { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: 10, padding: 10, alignItems: 'center', gap: 2 },
  value: { fontSize: 18, fontWeight: '800', color: Colors.accent },
  label: { fontSize: 9,  fontWeight: '600', color: Colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 40 },

  card:    { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, gap: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },

  detectiveName: { fontSize: 26, fontWeight: '800', color: Colors.textLight },
  rankBadge:     { alignSelf: 'flex-start', backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  rankText:      { fontSize: 12, fontWeight: '700', color: Colors.accent, letterSpacing: 1, textTransform: 'uppercase' },

  statsRow:  { flexDirection: 'row', gap: 8 },

  // NPC rows
  npcRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: Colors.border + '66' },
  npcInfo:   { width: 110, gap: 2 },
  npcName:   { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  npcRole:   { fontSize: 10, color: Colors.textMuted },
  npcRight:  { flex: 1, gap: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusText:{ fontSize: 11, fontWeight: '600' },
  valueText: { fontSize: 11, color: Colors.textMuted },

  dangerBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.danger },
  dangerBtnText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
});
