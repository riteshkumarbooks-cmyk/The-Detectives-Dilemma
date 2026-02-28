import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { signOut } from '@/services/auth';
import { useAuth } from '@/hooks/useAuth';

// ── Ranking ladder ────────────────────────────────────────────────────────────
// Score = casesWon − floor(wrongGuesses / 3)
const RANKS = [
  { min: 0,   label: 'Novice'            },
  { min: 3,   label: 'Apprentice'        },
  { min: 10,  label: 'Investigator'      },
  { min: 25,  label: 'Detective'         },
  { min: 50,  label: 'Senior Detective'  },
  { min: 100, label: 'Inspector'         },
  { min: 200, label: 'Chief Inspector'   },
  { min: 500, label: 'Master'            },
];

function getRank(casesWon: number, wrongGuesses: number): string {
  const score = Math.max(0, casesWon - Math.floor(wrongGuesses / 3));
  return [...RANKS].reverse().find(r => score >= r.min)?.label ?? 'Novice';
}

const GENDERS     = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'] as const;
const PREFERENCES = ['Men', 'Women', 'Both', 'None'] as const;

interface CharacterProfile {
  name:             string;
  gender:           string;
  age:              string;
  sexualPreference: string;
  casesWon:         number;
  wrongGuesses:     number;
}

export default function CharacterScreen() {
  const { user } = useAuth();
  const storageKey = `character_${user?.uid}`;

  const [profile,   setProfile]   = useState<CharacterProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loaded,    setLoaded]    = useState(false);

  // Edit-mode form state
  const [name,       setName]       = useState('');
  const [gender,     setGender]     = useState('');
  const [age,        setAge]        = useState('');
  const [preference, setPreference] = useState('');

  // Load saved profile on mount
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(data => {
      if (data) {
        setProfile(JSON.parse(data));
      } else {
        setIsEditing(true);
      }
      setLoaded(true);
    });
  }, [storageKey]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your detective name.');
      return;
    }
    if (!gender) {
      Alert.alert('Required', 'Please select your gender.');
      return;
    }
    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 18) {
      Alert.alert('Age Restriction', 'You must be 18 or older to play.');
      return;
    }
    if (ageNum > 120) {
      Alert.alert('Invalid Age', 'Please enter a valid age.');
      return;
    }
    if (!preference) {
      Alert.alert('Required', 'Please select your sexual preference.');
      return;
    }

    const newProfile: CharacterProfile = {
      name:             name.trim(),
      gender,
      age:              String(ageNum),
      sexualPreference: preference,
      casesWon:         0,
      wrongGuesses:     0,
    };

    await AsyncStorage.setItem(storageKey, JSON.stringify(newProfile));
    setProfile(newProfile);
    setIsEditing(false);
  }

  function handleReset() {
    Alert.alert(
      'Reset Detective',
      'This will permanently delete your detective profile and reset all progress. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(storageKey);
            setProfile(null);
            setName('');
            setGender('');
            setAge('');
            setPreference('');
            setIsEditing(true);
          },
        },
      ]
    );
  }

  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  // ── View mode ─────────────────────────────────────────────────────────────
  if (!isEditing && profile) {
    const rank = getRank(profile.casesWon, profile.wrongGuesses);
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🕵️</Text>
          <Text style={styles.profileName}>Detective {profile.name}</Text>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{rank}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identity</Text>
          <Row label="Name"               value={profile.name}             />
          <Row label="Gender"             value={profile.gender}           />
          <Row label="Age"                value={`${profile.age} yrs`}     />
          <Row label="Romance Interest"  value={profile.sexualPreference} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Case Record</Text>
          <Row label="Cases Solved"   value={String(profile.casesWon)}     />
          <Row label="Wrong Guesses"  value={String(profile.wrongGuesses)} />
          <Row label="Current Rank"   value={rank} highlight              />
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>Reset Detective</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🕵️</Text>
        <Text style={styles.title}>Create Your Detective</Text>
        <Text style={styles.subtitle}>Shape your story before the investigation begins.</Text>
      </View>

      {/* Name */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity</Text>

        <Text style={styles.fieldLabel}>Detective Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name…"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={setName}
          autoCorrect={false}
        />

        <Text style={styles.fieldLabel}>Gender</Text>
        <View style={styles.optionGrid}>
          {GENDERS.map(g => (
            <TouchableOpacity
              key={g}
              style={[styles.optionBtn, gender === g && styles.optionBtnActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.optionText, gender === g && styles.optionTextActive]}>
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Age <Text style={styles.fieldNote}>(18+ only)</Text></Text>
        <TextInput
          style={[styles.input, styles.inputNarrow]}
          placeholder="e.g. 28"
          placeholderTextColor={Colors.textMuted}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          maxLength={3}
        />

        <Text style={styles.fieldLabel}>Romance Interest</Text>
        <View style={styles.optionGrid}>
          {PREFERENCES.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.optionBtn, preference === p && styles.optionBtnActive]}
              onPress={() => setPreference(p)}
            >
              <Text style={[styles.optionText, preference === p && styles.optionTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Begin Investigation</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Small reusable row for view mode ─────────────────────────────────────────
function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, highlight && rowStyles.valueHighlight]}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  label: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    color: Colors.textLight,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  valueHighlight: {
    color: Colors.accent,
  },
});

// ── Main styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
    gap: 20,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 4,
  },
  headerEmoji: {
    fontSize: 52,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textLight,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.accent,
    fontStyle: 'italic',
    marginTop: 6,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  profileName: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textLight,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  rankBadge: {
    marginTop: 10,
    backgroundColor: Colors.accent + '22',
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  rankText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Section card
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Form fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: -4,
  },
  fieldNote: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '400',
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textLight,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputNarrow: {
    width: 110,
  },

  // Option pills (gender / preference)
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  optionBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '22',
  },
  optionText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextActive: {
    color: Colors.accent,
  },

  // Buttons
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textDark,
    letterSpacing: 0.5,
  },
  resetBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.danger,
  },
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  signOutText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
