import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Modal,
  Alert,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { Audio } from 'expo-av';
import { DeviceMotion } from 'expo-sensors';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '@/config/firebase';
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
    image:    require('../../../assets/characters/man-young.gif') as number,
  },
  {
    id:       'man-mid',
    name:     'Marcus Reid',
    subtitle: 'Male · 30–45',
    image:    require('../../../assets/characters/man-mid.gif') as number,
  },
  {
    id:       'man-senior',
    name:     'Victor Kane',
    subtitle: 'Male · 45–70',
    image:    require('../../../assets/characters/man-senior.gif') as number,
  },
  {
    id:       'woman-young',
    name:     'Zoe Hart',
    subtitle: 'Female · 20–30',
    image:    require('../../../assets/characters/woman-young.gif') as number,
  },
  {
    id:       'woman-mid',
    name:     'Diana Cross',
    subtitle: 'Female · 30–45',
    image:    require('../../../assets/characters/woman-mid.gif') as number,
  },
  {
    id:       'woman-senior',
    name:     'Eleanor Voss',
    subtitle: 'Female · 45–70',
    image:    require('../../../assets/characters/woman-senior.gif') as number,
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

  // ── Parallax depth refs ────────────────────────────────────────────────────
  const bgShift   = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const charShift = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // ── Background music ──────────────────────────────────────────────────────
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    async function startMusic() {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,   // play even when iPhone is on silent
        staysActiveInBackground: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        require('../../../assets/audio/music/Shadow_Alley_Nocturne.wav'),
        { shouldPlay: true, isLooping: true, volume: 0.5 }
      );
      soundRef.current = sound;
    }
    startMusic();
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    let sub: ReturnType<typeof DeviceMotion.addListener> | null = null;
    DeviceMotion.isAvailableAsync().then(available => {
      if (!available) return;
      DeviceMotion.setUpdateInterval(50);
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        // gamma = left/right tilt, beta = front/back tilt (radians → degrees)
        const tiltX = Math.max(-15, Math.min(15, (rotation.gamma ?? 0) * (180 / Math.PI)));
        const tiltY = Math.max(-15, Math.min(15, (rotation.beta  ?? 0) * (180 / Math.PI)));
        Animated.spring(bgShift,   { toValue: { x: tiltX * 0.3, y: tiltY * 0.3 }, useNativeDriver: true, damping: 20, stiffness: 80 }).start();
        Animated.spring(charShift, { toValue: { x: tiltX * 1.0, y: tiltY * 1.0 }, useNativeDriver: true, damping: 20, stiffness: 80 }).start();
      });
    });
    return () => { sub?.remove(); };
  }, []);

  useEffect(() => {
    async function loadProfile() {
      // 1. Try local cache first (instant)
      const cached = await AsyncStorage.getItem(profileKey);
      if (cached) {
        const p: CharacterProfile = JSON.parse(cached);
        setProfile(p);
        const resolved = resolveCharacter(p.gender, p.age);
        await AsyncStorage.setItem(characterKey, resolved);
        setSelectedId(resolved);
        return;
      }

      // 2. Cache miss (new device or cleared storage) — fetch from Firestore
      if (!user?.uid) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      const remote = snap.data()?.character as CharacterProfile | undefined;
      if (!remote) return;

      // Hydrate local cache from Firestore so next load is instant
      await AsyncStorage.setItem(profileKey, JSON.stringify(remote));
      setProfile(remote);
      const resolved = resolveCharacter(remote.gender, remote.age);
      await AsyncStorage.setItem(characterKey, resolved);
      setSelectedId(resolved);
    }
    loadProfile();
  }, [profileKey, characterKey, user?.uid]);

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
            if (user?.uid) {
              await setDoc(doc(db, 'users', user.uid), { character: deleteField() }, { merge: true });
            }
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
    <View style={styles.bg}>
      {/* Background — moves subtly on tilt (far layer) */}
      <Animated.Image
        source={require('../../../assets/office-bg.png')}
        style={[styles.bgImage, { transform: bgShift.getTranslateTransform() }]}
        resizeMode="cover"
      />

      {/* Dark overlay */}
      <View style={styles.overlay} />

      {/* Character — moves more on tilt (near layer) */}
      {selectedChar && (
        <Animated.Image
          source={selectedChar.image}
          style={[styles.characterStanding, { transform: charShift.getTranslateTransform() }]}
          resizeMode="contain"
          pointerEvents="none"
        />
      )}

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
    </View>
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
  bg:      { flex: 1, backgroundColor: '#0D0D0D', overflow: 'hidden' },
  // Slightly oversized so parallax shift doesn't reveal edges
  bgImage: { position: 'absolute', width: SW * 1.1, height: SH * 1.1, top: -SH * 0.05, left: -SW * 0.05 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
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
