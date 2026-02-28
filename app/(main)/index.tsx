import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { signOut } from '@/services/auth';

const TOTAL_POINTS = 20;

const SKILLS = [
  { key: 'charisma',  label: 'Charisma',         desc: 'Persuasion & social influence' },
  { key: 'strength',  label: 'Strength',          desc: 'Physical power & endurance'   },
  { key: 'vitality',  label: 'Vitality',          desc: 'Health & resilience'           },
  { key: 'tech',      label: 'Tech',              desc: 'Gadgets & digital mastery'     },
  { key: 'intelligence', label: 'Intelligence',  desc: 'Observation & deduction'       },
  { key: 'speed',        label: 'Speed',         desc: 'Agility & quick reflexes'       },
] as const;

type SkillKey = typeof SKILLS[number]['key'];
type SkillMap = Record<SkillKey, number>;

const GENDERS = ['Male', 'Female', 'Other'] as const;
type Gender = typeof GENDERS[number];

const ZERO_SKILLS: SkillMap = {
  charisma: 0, strength: 0, vitality: 0,
  tech: 0, intelligence: 0, speed: 0,
};

export default function CharacterCreationScreen() {
  const [name, setName]     = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [age, setAge]       = useState('');
  const [skills, setSkills] = useState<SkillMap>(ZERO_SKILLS);

  const usedPoints  = Object.values(skills).reduce((a, b) => a + b, 0);
  const remaining   = TOTAL_POINTS - usedPoints;
  const canBegin    = name.trim().length > 0 && gender !== null;

  function adjustSkill(key: SkillKey, delta: number) {
    const next = skills[key] + delta;
    if (next < 0) return;
    if (delta > 0 && remaining <= 0) return;
    setSkills(prev => ({ ...prev, [key]: next }));
  }

  function handleBegin() {
    // TODO Phase 2: save character to Firestore
    Alert.alert(
      'Detective Ready',
      `Welcome, ${name}! Your investigation begins soon.`,
      [{ text: 'Continue' }]
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🕵️</Text>
        <Text style={styles.title}>Create Your Detective</Text>
        <Text style={styles.subtitle}>Shape your story before the investigation begins.</Text>
      </View>

      {/* ── Identity ─────────────────────────────────────────── */}
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
        <View style={styles.genderRow}>
          {GENDERS.map(g => (
            <TouchableOpacity
              key={g}
              style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.genderBtnText, gender === g && styles.genderBtnTextActive]}>
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Age</Text>
        <TextInput
          style={[styles.input, styles.inputNarrow]}
          placeholder="e.g. 32"
          placeholderTextColor={Colors.textMuted}
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          maxLength={3}
        />
      </View>

      {/* ── Skill Points ─────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.skillsHeaderRow}>
          <Text style={styles.sectionTitle}>Skill Points</Text>
          <View style={[styles.badge, remaining === 0 && styles.badgeDone]}>
            <Text style={styles.badgeText}>
              {remaining > 0 ? `${remaining} remaining` : '✓ All allocated'}
            </Text>
          </View>
        </View>

        {SKILLS.map(skill => (
          <View key={skill.key} style={styles.skillRow}>
            <View style={styles.skillInfo}>
              <Text style={styles.skillLabel}>{skill.label}</Text>
              <Text style={styles.skillDesc}>{skill.desc}</Text>
            </View>
            <View style={styles.skillControls}>
              <TouchableOpacity
                style={[styles.adjBtn, skills[skill.key] === 0 && styles.adjBtnDisabled]}
                onPress={() => adjustSkill(skill.key, -1)}
                disabled={skills[skill.key] === 0}
              >
                <Text style={styles.adjBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.skillValue}>{skills[skill.key]}</Text>
              <TouchableOpacity
                style={[styles.adjBtn, remaining === 0 && styles.adjBtnDisabled]}
                onPress={() => adjustSkill(skill.key, 1)}
                disabled={remaining === 0}
              >
                <Text style={styles.adjBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* ── Actions ──────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.beginBtn, !canBegin && styles.beginBtnDisabled]}
        onPress={handleBegin}
        disabled={!canBegin}
      >
        <Text style={styles.beginBtnText}>Begin Investigation</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutBtn} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
    gap: 24,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  headerEmoji: {
    fontSize: 52,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
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

  // Fields
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: -4,
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
    width: 100,
  },

  // Gender
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  genderBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentDim + '30',
  },
  genderBtnText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  genderBtnTextActive: {
    color: Colors.accent,
  },

  // Skills
  skillsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '20',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  skillInfo: {
    flex: 1,
    marginRight: 16,
  },
  skillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textLight,
  },
  skillDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  skillControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adjBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjBtnDisabled: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adjBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    lineHeight: 22,
  },
  skillValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textLight,
    width: 24,
    textAlign: 'center',
  },

  // Begin button
  beginBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  beginBtnDisabled: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  beginBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textDark,
    letterSpacing: 0.5,
  },

  // Sign out
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  signOutText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
});
