// minigame.tsx — Mini-game host screen
//
// Receives params from episode.tsx:
//   minigameType:   'hidden_objects' | 'rps_combat' | 'interrogation'
//   minigameConfig: JSON string of config object
//   clientId, seasonId, episodeId: for context / Firestore writes
//
// On completion:
//   1. Calls setMinigameResult('win' | 'lose')
//   2. Calls router.back()  → episode.tsx resumes story via useFocusEffect
//
// Phase 4: replace the placeholder UI with real mini-game components per type.

import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { setMinigameResult } from '@/services/minigameResult';
import { Colors } from '@/constants/colors';

const MINIGAME_LABELS: Record<string, { icon: string; name: string; description: string }> = {
  hidden_objects: {
    icon:        '🔎',
    name:        'Find the Evidence',
    description: 'Search the scene and find all hidden objects before time runs out.',
  },
  rps_combat: {
    icon:        '⚔️',
    name:        'Confrontation',
    description: 'Read your opponent and choose your move. Best of three.',
  },
  interrogation: {
    icon:        '🎙️',
    name:        'Interrogation',
    description: 'Ask the right questions in the right order to break their story.',
  },
};

export default function MinigameScreen() {
  const router = useRouter();
  const { minigameType, minigameConfig, clientId, seasonId, episodeId } =
    useLocalSearchParams<{
      minigameType:   string;
      minigameConfig: string;
      clientId:       string;
      seasonId:       string;
      episodeId:      string;
    }>();

  const meta   = MINIGAME_LABELS[minigameType] ?? { icon: '🎮', name: 'Mini-Game', description: 'Complete the challenge.' };
  let   config = {};
  try { config = JSON.parse(minigameConfig ?? '{}'); } catch (_) {}

  function finish(result: 'win' | 'lose') {
    setMinigameResult(result);
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => finish('lose')} style={styles.exitBtn}>
          <Text style={styles.exitText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Challenge</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Mini-game placeholder */}
      <View style={styles.body}>
        <Text style={styles.icon}>{meta.icon}</Text>
        <Text style={styles.name}>{meta.name}</Text>
        <Text style={styles.description}>{meta.description}</Text>

        <View style={styles.devNote}>
          <Text style={styles.devNoteText}>
            Phase 4 — Real mini-game coming here{'\n'}
            Type: {minigameType ?? '—'}{'\n'}
            Config: {JSON.stringify(config)}
          </Text>
        </View>

        {/* Simulate win / lose for testing */}
        <Text style={styles.testLabel}>Test result:</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.winBtn]} onPress={() => finish('win')}>
            <Text style={styles.btnText}>✓ Win</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.loseBtn]} onPress={() => finish('lose')}>
            <Text style={styles.btnText}>✗ Lose</Text>
          </TouchableOpacity>
        </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  exitBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  exitText:    { fontSize: 18, color: Colors.textMuted },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textLight },

  body:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  icon:        { fontSize: 64 },
  name:        { fontSize: 24, fontWeight: '800', color: Colors.textLight, textAlign: 'center' },
  description: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  devNote:     { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16, marginTop: 16, width: '100%' },
  devNoteText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Courier', lineHeight: 20 } as any,

  testLabel:   { fontSize: 12, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 24 },
  btnRow:      { flexDirection: 'row', gap: 16 },
  btn:         { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  winBtn:      { backgroundColor: '#2e7d32' },
  loseBtn:     { backgroundColor: Colors.danger },
  btnText:     { fontSize: 16, fontWeight: '800', color: '#fff' },
});
