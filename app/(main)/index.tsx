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
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { signOut } from '@/services/auth';
import { useAuth } from '@/hooks/useAuth';

const GENDERS     = ['Male', 'Female'] as const;
const PREFERENCES = ['Men', 'Women', 'Both', 'None'] as const;

interface CharacterProfile {
  firstName:        string;
  lastName:         string;
  gender:           string;
  age:              string;
  sexualPreference: string;
  casesWon:         number;
  wrongGuesses:     number;
}

export default function CharacterCreationScreen() {
  const { user }   = useAuth();
  const router     = useRouter();
  const profileKey = `character_${user?.uid}`;

  const [loaded,     setLoaded]     = useState(false);
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [gender,     setGender]     = useState('');
  const [age,        setAge]        = useState('');
  const [preference, setPreference] = useState('');

  // If profile already exists skip straight to the home screen
  useEffect(() => {
    AsyncStorage.getItem(profileKey).then(data => {
      if (data) {
        router.replace('/(main)/home');
      } else {
        setLoaded(true);
      }
    });
  }, [profileKey]);

  async function handleSave() {
    if (!firstName.trim()) {
      Alert.alert('Required', 'Please enter your first name.');
      return;
    }
    if (!lastName.trim()) {
      Alert.alert('Required', 'Please enter your last name.');
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
    if (ageNum > 70) {
      Alert.alert('Invalid Age', 'Maximum age is 70.');
      return;
    }
    if (!preference) {
      Alert.alert('Required', 'Please select your romance interest.');
      return;
    }

    const profile: CharacterProfile = {
      firstName:        firstName.trim(),
      lastName:         lastName.trim(),
      gender,
      age:              String(ageNum),
      sexualPreference: preference,
      casesWon:         0,
      wrongGuesses:     0,
    };

    await AsyncStorage.setItem(profileKey, JSON.stringify(profile));
    router.replace('/(main)/home');
  }

  // Show blank while checking AsyncStorage
  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity</Text>

        <Text style={styles.fieldLabel}>First Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Jane"
          placeholderTextColor={Colors.textMuted}
          value={firstName}
          onChangeText={setFirstName}
          autoCorrect={false}
        />

        <Text style={styles.fieldLabel}>Last Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Doe"
          placeholderTextColor={Colors.textMuted}
          value={lastName}
          onChangeText={setLastName}
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

        <Text style={styles.fieldLabel}>
          Age <Text style={styles.fieldNote}>(18+ only)</Text>
        </Text>
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

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48, gap: 20 },

  header:      { alignItems: 'center', marginBottom: 4 },
  headerEmoji: { fontSize: 52, marginBottom: 12 },
  title:       { fontSize: 26, fontWeight: '800', color: Colors.textLight, textAlign: 'center', letterSpacing: 0.5 },
  subtitle:    { fontSize: 13, color: Colors.accent, fontStyle: 'italic', marginTop: 6, letterSpacing: 0.5, textAlign: 'center' },

  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 2, textTransform: 'uppercase' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textLight, marginBottom: -4 },
  fieldNote:  { fontSize: 11, color: Colors.textMuted, fontWeight: '400' },

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
  inputNarrow: { width: 110 },

  optionGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated },
  optionBtnActive:   { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  optionText:        { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  optionTextActive:  { color: Colors.accent },

  saveBtn:      { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText:  { fontSize: 16, fontWeight: '800', color: Colors.textDark, letterSpacing: 0.5 },

  signOutBtn:   { alignItems: 'center', paddingVertical: 8 },
  signOutText:  { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
});
