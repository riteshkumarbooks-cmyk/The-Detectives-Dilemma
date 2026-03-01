import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ImageBackground,
  TouchableOpacity,
  Modal,
  Alert,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { signOut } from '@/services/auth';
import { useAuth } from '@/hooks/useAuth';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Auto-select character from profile ───────────────────────────────────────
function resolveCharacter(gender: string, age: string): CharacterId {
  const ageNum   = parseInt(age, 10);
  const isFemale = gender === 'Female';
  if (ageNum <= 30) return isFemale ? 'woman-young'  : 'man-young';
  if (ageNum <= 45) return isFemale ? 'woman-mid'    : 'man-mid';
  return                    isFemale ? 'woman-senior' : 'man-senior';
}

// ── Ranking ───────────────────────────────────────────────────────────────────
const RANKS = [
  { min: 0,   label: 'Novice'           },
  { min: 3,   label: 'Apprentice'       },
  { min: 10,  label: 'Investigator'     },
  { min: 25,  label: 'Detective'        },
  { min: 50,  label: 'Senior Detective' },
  { min: 100, label: 'Inspector'        },
  { min: 200, label: 'Chief Inspector'  },
  { min: 500, label: 'Master'           },
];
function getRank(won: number, wrong: number) {
  const score = Math.max(0, won - Math.floor(wrong / 3));
  return [...RANKS].reverse().find(r => score >= r.min)?.label ?? 'Novice';
}

// ── Character roster ──────────────────────────────────────────────────────────
const CHARACTERS = [
  {
    id:       'man-young',
    name:     'Jake Carter',
    subtitle: 'Male · 20–30',
    image:    require('../../assets/characters/man-young.png') as number,
  },
  {
    id:       'man-mid',
    name:     'Marcus Reid',
    subtitle: 'Male · 30–45',
    image:    require('../../assets/characters/man-mid.png') as number,
  },
  {
    id:       'man-senior',
    name:     'Victor Kane',
    subtitle: 'Male · 45–70',
    image:    require('../../assets/characters/man-senior.png') as number,
  },
  {
    id:       'woman-young',
    name:     'Zoe Hart',
    subtitle: 'Female · 20–30',
    image:    require('../../assets/characters/woman-young.png') as number,
  },
  {
    id:       'woman-mid',
    name:     'Diana Cross',
    subtitle: 'Female · 30–45',
    image:    require('../../assets/characters/woman-mid.png') as number,
  },
  {
    id:       'woman-senior',
    name:     'Eleanor Voss',
    subtitle: 'Female · 45–70',
    image:    require('../../assets/characters/woman-senior.png') as number,
  },
] as const;

type CharacterId = typeof CHARACTERS[number]['id'];

interface CharacterProfile {
  firstName: string; lastName: string; gender: string; age: string;
  sexualPreference: string; casesWon: number; wrongGuesses: number;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user }      = useAuth();
  const router        = useRouter();
  const profileKey    = `character_${user?.uid}`;
  const characterKey  = `selected_character_${user?.uid}`;

  const [profile,      setProfile]      = useState<CharacterProfile | null>(null);
  const [selectedId,   setSelectedId]   = useState<CharacterId | null>(null);
  const [showProfile,  setShowProfile]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(profileKey).then(async pData => {
      if (!pData) return;
      const p: CharacterProfile = JSON.parse(pData);
      setProfile(p);

      // Auto-assign character from gender + age; persist so it survives re-renders
      const resolved = resolveCharacter(p.gender, p.age);
      await AsyncStorage.setItem(characterKey, resolved);
      setSelectedId(resolved);
    });
  }, [profileKey, characterKey]);

  // ── Profile reset ─────────────────────────────────────────────────────────
  function handleReset() {
    Alert.alert(
      'Reset Detective',
      'This permanently deletes your detective profile, character choice, and all case progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([profileKey, characterKey]);
            setShowProfile(false);
            router.replace('/(main)');
          },
        },
      ]
    );
  }

  const selectedChar = CHARACTERS.find(c => c.id === selectedId) ?? null;
  const rank         = profile ? getRank(profile.casesWon, profile.wrongGuesses) : 'Novice';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ImageBackground
      source={require('../../assets/office-bg.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      {/* Dark overlay so UI stays readable */}
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safe}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topGreeting}>Welcome back,</Text>
            <Text style={styles.topName}>Detective {profile ? `${profile.firstName} ${profile.lastName}` : '…'}</Text>
          </View>
          <TouchableOpacity style={styles.profileBtn} onPress={() => setShowProfile(true)}>
            <Text style={styles.profileBtnIcon}>👤</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>

      {/* Character standing in the scene — absolutely over the background */}
      {selectedChar && (
        <Image
          source={selectedChar.image}
          style={styles.characterStanding}
          resizeMode="contain"
          pointerEvents="none"
        />
      )}

      {/* Bottom nameplate overlay */}
      {profile && (
        <View style={styles.namePlate}>
          <Text style={styles.heroName}>{profile.firstName} {profile.lastName}</Text>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
        </View>
      )}

      {/* ── Profile modal ────────────────────────────────────────────────── */}
      <Modal
        visible={showProfile}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProfile(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowProfile(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Detective Profile</Text>

          {profile && (
            <>
              <View style={styles.modalSection}>
                <ProfileRow label="First Name"       value={profile.firstName}        />
                <ProfileRow label="Last Name"        value={profile.lastName}         />
                <ProfileRow label="Gender"           value={profile.gender}           />
                <ProfileRow label="Age"              value={`${profile.age} yrs`}     />
                <ProfileRow label="Romance Interest" value={profile.sexualPreference} />
              </View>
              <View style={styles.modalSection}>
                <ProfileRow label="Cases Solved"  value={String(profile.casesWon)}     />
                <ProfileRow label="Wrong Guesses" value={String(profile.wrongGuesses)} />
                <ProfileRow label="Rank"          value={rank} highlight               />
              </View>
            </>
          )}

          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>Reset Detective</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ImageBackground>
  );
}

// ── Small reusable row ────────────────────────────────────────────────────────
function ProfileRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, highlight && rowStyles.highlight]}>{value}</Text>
    </View>
  );
}
const rowStyles = StyleSheet.create({
  row:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  label:     { fontSize: 13, color: Colors.textMuted },
  value:     { fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  highlight: { color: Colors.accent },
});

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  bg:      { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  safe:    { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  topGreeting: { fontSize: 12, color: Colors.textMuted, letterSpacing: 0.5 },
  topName:     { fontSize: 20, fontWeight: '800', color: Colors.textLight },
  profileBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface + 'CC', borderWidth: 1, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  profileBtnIcon: { fontSize: 20 },

  // Character standing in the office
  characterStanding: {
    position: 'absolute',
    bottom: -SH * 0.06,
    left: SW * 0.02,
    width: SW * 0.92,
    height: SH * 1.03,
  },

  // Nameplate bottom-right
  namePlate: {
    position: 'absolute',
    bottom: 48,
    right: 24,
    alignItems: 'flex-end',
    gap: 8,
  },
  heroName: { fontSize: 22, fontWeight: '800', color: Colors.textLight, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  rankBadge: { backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  rankText:  { fontSize: 12, fontWeight: '700', color: Colors.accent, letterSpacing: 1, textTransform: 'uppercase' },

  // Profile modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: Colors.textLight, textAlign: 'center' },
  modalSection: { backgroundColor: Colors.surfaceElevated, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border },

  resetBtn:     { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.danger },
  resetBtnText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
  signOutBtn:   { alignItems: 'center', paddingVertical: 4 },
  signOutText:  { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
