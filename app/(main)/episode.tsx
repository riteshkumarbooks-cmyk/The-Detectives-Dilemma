// Episode Player — Phase 3 Steps 2–6
// Renders image, dialogue, and choice scenes fetched from Firestore.
// Saves progress after every scene. Handles episode completion.

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection, doc, getDoc, getDocs,
  setDoc, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';

const { width: SW, height: SH } = Dimensions.get('window');

// Static NPC name map — replace with Firestore fetch in Phase 5 if NPCs grow large
const NPC_NAMES: Record<string, string> = {
  'duchess-margaux':    'Duchess Margaux de Valois',
  'marcus-webb':        'Marcus Webb',
  'luna':               'Luna',
  'commissioner-hayes': 'Commissioner Hayes',
  'victoria-cross':     'Victoria Cross',
  'lady-ashworth':      'Lady Ashworth',
  'prof-morley':        'Prof. Morley',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface ImmediateEffect {
  relationshipEffects?: { npcId: string; delta: number }[];
  clueGrant?: string[];
}

interface Choice {
  text:        string;
  nextSceneId: string;
  immediate?:  ImmediateEffect;
}

interface Scene {
  sceneId:      string;
  type:         'image' | 'dialogue' | 'choice' | 'minigame' | 'episode_end';
  imageUrl?:    string | null;
  audioUrl?:    string | null;
  dialogueText?: string;
  speakerNpcId?: string;
  nextSceneId?:  string;
  choices?:      Choice[];
  immediate?:    ImmediateEffect;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function EpisodeScreen() {
  const { clientId, seasonId, episodeId } = useLocalSearchParams<{
    clientId: string; seasonId: string; episodeId: string;
  }>();
  const { user } = useAuth();
  const router   = useRouter();

  const [scenes,       setScenes]       = useState<Record<string, Scene>>({});
  const [currentId,    setCurrentId]    = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [complete,     setComplete]     = useState(false);

  useEffect(() => {
    if (!clientId || !seasonId || !episodeId) return;
    loadEpisode();
  }, [clientId, seasonId, episodeId]);

  // ── Load episode + scenes ──────────────────────────────────────────────────
  async function loadEpisode() {
    try {
      // 1. Episode doc → title + startSceneId
      const epSnap = await getDoc(
        doc(db, 'clients', clientId, 'seasons', seasonId, 'episodes', episodeId)
      );
      if (!epSnap.exists()) return;
      const epData = epSnap.data();
      setEpisodeTitle(epData.title ?? '');

      // 2. All scenes (loaded upfront — avoids per-scene round trips)
      const scenesSnap = await getDocs(
        collection(db, 'clients', clientId, 'seasons', seasonId, 'episodes', episodeId, 'scenes')
      );
      const map: Record<string, Scene> = {};
      scenesSnap.forEach(d => { map[d.id] = d.data() as Scene; });
      setScenes(map);

      // 3. Resume from saved progress if available
      let startId: string = epData.startSceneId;
      if (user?.uid) {
        const progressSnap = await getDoc(
          doc(db, 'users', user.uid, 'progress', clientId)
        );
        const saved = progressSnap.data();
        if (
          saved?.currentEpisodeId === episodeId &&
          saved?.currentSceneId &&
          saved.currentSceneId !== 'ep1_end'   // don't resume from end
        ) {
          startId = saved.currentSceneId;
        }
      }

      setCurrentId(startId);
    } catch (e) {
      console.error('Failed to load episode:', e);
    } finally {
      setLoading(false);
    }
  }

  // ── Save progress (Step 5) ─────────────────────────────────────────────────
  async function saveProgress(sceneId: string) {
    if (!user?.uid) return;
    await setDoc(
      doc(db, 'users', user.uid, 'progress', clientId),
      {
        currentSeasonId:  seasonId,
        currentEpisodeId: episodeId,
        currentSceneId:   sceneId,
        lastPlayedAt:     serverTimestamp(),
      },
      { merge: true }
    );
  }

  // ── Apply immediate effects (relationships + clues) ────────────────────────
  async function applyEffects(effects: ImmediateEffect) {
    if (!user?.uid) return;

    if (effects.relationshipEffects?.length) {
      const userRef  = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const existing: any[] = userSnap.data()?.relationships ?? [];
      const updated = existing.map(r => {
        const fx = effects.relationshipEffects!.find(e => e.npcId === r.npcId);
        if (!fx) return r;
        return { ...r, value: Math.max(-100, Math.min(100, r.value + fx.delta)) };
      });
      await setDoc(userRef, { relationships: updated }, { merge: true });
    }

    if (effects.clueGrant?.length) {
      await setDoc(
        doc(db, 'users', user.uid, 'progress', clientId),
        { cluesFound: arrayUnion(...effects.clueGrant) },
        { merge: true }
      );
    }
  }

  // ── Advance to next scene (Steps 3+4) ─────────────────────────────────────
  async function advance(nextSceneId: string, effects?: ImmediateEffect) {
    if (effects) await applyEffects(effects);
    await saveProgress(nextSceneId);

    if (scenes[nextSceneId]?.type === 'episode_end') {
      await handleEpisodeEnd();
    } else {
      setCurrentId(nextSceneId);
    }
  }

  // ── Episode end (Step 6) ───────────────────────────────────────────────────
  async function handleEpisodeEnd() {
    if (!user?.uid) return;
    const progressRef = doc(db, 'users', user.uid, 'progress', clientId);
    const snap        = await getDoc(progressRef);
    const played      = (snap.data()?.episodesPlayedCount ?? 0) as number;
    await setDoc(
      progressRef,
      {
        completedEpisodes:   arrayUnion(episodeId),
        episodesPlayedCount: played + 1,
        lastPlayedAt:        serverTimestamp(),
      },
      { merge: true }
    );
    setComplete(true);
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  // ── Episode complete ───────────────────────────────────────────────────────
  if (complete) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.completeWrap}>
          <Text style={styles.completeIcon}>⭐</Text>
          <Text style={styles.completeTitle}>Episode Complete</Text>
          <Text style={styles.completeSubtitle}>{episodeTitle}</Text>
          <Text style={styles.completeSub}>
            Your choices have been recorded.{'\n'}The investigation continues…
          </Text>
          <TouchableOpacity style={styles.completeBtn} onPress={() => router.back()}>
            <Text style={styles.completeBtnText}>Back to Case</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const scene = currentId ? scenes[currentId] : null;

  if (!scene) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Scene not found.</Text>
      </View>
    );
  }

  // ── Render scene ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Background — S3 image when available, dark fill otherwise */}
      {scene.imageUrl
        ? <Image source={{ uri: scene.imageUrl }} style={styles.bgImage} resizeMode="cover" />
        : <View style={styles.bgDark} />
      }
      <View style={styles.overlay} />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.exitBtn}>
          <Text style={styles.exitText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{episodeTitle}</Text>
        <View style={{ width: 36 }} />
      </SafeAreaView>

      {/* ── Image scene — tap anywhere to advance ───────────────────────── */}
      {scene.type === 'image' && (
        <TouchableOpacity
          style={styles.tapZone}
          activeOpacity={1}
          onPress={() => scene.nextSceneId && advance(scene.nextSceneId, scene.immediate)}
        >
          <View style={styles.tapHintWrap}>
            <Text style={styles.tapHintText}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Dialogue scene — tap anywhere to advance ────────────────────── */}
      {scene.type === 'dialogue' && (
        <TouchableOpacity
          style={styles.tapZone}
          activeOpacity={1}
          onPress={() => scene.nextSceneId && advance(scene.nextSceneId, scene.immediate)}
        >
          <View style={styles.dialogueBox}>
            {scene.speakerNpcId && (
              <Text style={styles.speakerName}>
                {NPC_NAMES[scene.speakerNpcId] ?? scene.speakerNpcId}
              </Text>
            )}
            <Text style={styles.dialogueText}>{scene.dialogueText}</Text>
            <Text style={styles.tapHintText}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Choice scene — buttons, no tap-to-advance ───────────────────── */}
      {scene.type === 'choice' && (
        <View style={styles.choiceWrap}>
          <Text style={styles.choicePrompt}>What do you do?</Text>
          {scene.choices?.map((choice, i) => (
            <TouchableOpacity
              key={i}
              style={styles.choiceBtn}
              onPress={() => advance(choice.nextSceneId, choice.immediate)}
              activeOpacity={0.75}
            >
              <Text style={styles.choiceBtnText}>{choice.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Minigame scene — Phase 4 placeholder ────────────────────────── */}
      {scene.type === 'minigame' && (
        <View style={styles.choiceWrap}>
          <Text style={styles.speakerName}>Mini-Game</Text>
          <Text style={styles.dialogueText}>Coming in Phase 4.</Text>
          <TouchableOpacity
            style={styles.choiceBtn}
            onPress={() => scene.nextSceneId && advance(scene.nextSceneId)}
          >
            <Text style={styles.choiceBtnText}>Skip (Phase 4)</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },

  bgImage: { ...StyleSheet.absoluteFillObject },
  bgDark:  { ...StyleSheet.absoluteFillObject, backgroundColor: '#0D0D0D' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },

  // Top bar
  topBar: {
    position:       'absolute',
    top:            0, left: 0, right: 0,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop:     8,
  },
  exitBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  exitText: { fontSize: 18, color: Colors.textMuted },
  topTitle: { fontSize: 13, color: Colors.textMuted, fontWeight: '600', flex: 1, textAlign: 'center' },

  // Tap zone (image + dialogue)
  tapZone:     { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  tapHintWrap: { padding: 32, alignItems: 'center' },
  tapHintText: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 6 },

  // Dialogue box
  dialogueBox: {
    backgroundColor: 'rgba(13,13,13,0.93)',
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
    padding:         24,
    paddingBottom:   48,
    gap:             10,
  },
  speakerName:  { fontSize: 12, color: Colors.accent, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  dialogueText: { fontSize: 17, color: Colors.textLight, lineHeight: 27 },

  // Choice buttons
  choiceWrap: {
    position:        'absolute',
    bottom:          0, left: 0, right: 0,
    backgroundColor: 'rgba(13,13,13,0.96)',
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
    padding:         20,
    paddingBottom:   48,
    gap:             12,
  },
  choicePrompt:  { fontSize: 11, color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  choiceBtn:     { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent + '55', borderRadius: 12, padding: 16 },
  choiceBtnText: { fontSize: 15, color: Colors.textLight, lineHeight: 22 },

  // Episode complete
  completeWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  completeIcon:     { fontSize: 56 },
  completeTitle:    { fontSize: 26, fontWeight: '800', color: Colors.textLight },
  completeSubtitle: { fontSize: 15, color: Colors.accent, fontStyle: 'italic', textAlign: 'center' },
  completeSub:      { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginTop: 8 },
  completeBtn:      { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 16 },
  completeBtnText:  { fontSize: 16, fontWeight: '800', color: '#0D0D0D' },

  errorText: { color: Colors.textMuted },
});
