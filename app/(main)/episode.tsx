// episode.tsx — inkjs-powered Episode Player
//
// Narrative engine: Ink (inkjs)
//   • .ink scripts authored in Inky editor → compiled via: node scripts/compile-ink.mjs
//   • Tags drive scene type, speaker, emotion, video cue, clue grants
//   • Variables drive relationship scores (synced to Firestore after each scene)
//   • story.state.ToJson() → saved to Firestore for exact-position resume
//
// Firestore writes (users/{uid}/progress/{clientId}):
//   inkStateJson   — full ink state blob (resume from exact scene)
//   choicesMade    — named map { [sceneKnotId]: { index, text, madeAt } }
//   cluesFound     — string[] of discovered clue IDs
//   completedEpisodes, episodesPlayedCount, lastPlayedAt

import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Story } from 'inkjs';
import {
  doc, getDoc, setDoc, serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';
import { getStoryJson, INK_VAR_TO_NPC } from '@/config/storyMap';

// ── NPC display names ──────────────────────────────────────────────────────
const NPC_NAMES: Record<string, string> = {
  'duchess-margaux':    'Duchess Margaux de Valois',
  'marcus-webb':        'Marcus Webb',
  'luna':               'Luna',
  'commissioner-hayes': 'Commissioner Hayes',
  'victoria-cross':     'Victoria Cross',
  'lady-ashworth':      'Lady Ashworth',
  'prof-morley':        'Prof. Morley',
};

// ── Types ──────────────────────────────────────────────────────────────────
interface ParsedTags {
  scene?:   string;
  type?:    string;   // image | dialogue | choice | video | minigame | episode_end
  speaker?: string;
  emotion?: string;
  clues:    string[];
}

function parseTags(tags: string[]): ParsedTags {
  const result: ParsedTags = { clues: [] };
  for (const t of tags) {
    const colonIdx = t.indexOf(':');
    if (colonIdx === -1) continue;
    const key = t.slice(0, colonIdx).trim();
    const val = t.slice(colonIdx + 1).trim();
    if (key === 'scene')   result.scene   = val;
    if (key === 'type')    result.type    = val;
    if (key === 'speaker') result.speaker = val;
    if (key === 'emotion') result.emotion = val;
    if (key === 'clue')    result.clues.push(val);
  }
  return result;
}

// ── Screen ─────────────────────────────────────────────────────────────────
export default function EpisodeScreen() {
  const { clientId, seasonId, episodeId } = useLocalSearchParams<{
    clientId: string; seasonId: string; episodeId: string;
  }>();
  const { user } = useAuth();
  const router   = useRouter();

  const storyRef = useRef<Story | null>(null);

  const [episodeTitle, setEpisodeTitle] = useState('');
  const [loading,      setLoading]      = useState(true);
  const [complete,     setComplete]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Current rendered state
  const [displayText, setDisplayText] = useState('');
  const [tags,        setTags]        = useState<ParsedTags>({ clues: [] });
  const [choices,     setChoices]     = useState<{ text: string; index: number }[]>([]);

  // Persistent progress
  const [cluesFound, setCluesFound] = useState<string[]>([]);
  const [showClues,  setShowClues]  = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId || !seasonId || !episodeId) return;
    initEpisode();
  }, [clientId, seasonId, episodeId]);

  async function initEpisode() {
    try {
      // 1. Episode title from Firestore
      const epSnap = await getDoc(
        doc(db, 'clients', clientId, 'seasons', seasonId, 'episodes', episodeId)
      );
      setEpisodeTitle(epSnap.exists() ? (epSnap.data().title ?? '') : '');

      // 2. Load compiled ink story
      const storyJson = getStoryJson(clientId, episodeId);
      if (!storyJson) {
        console.error(`No story found for ${clientId}/${episodeId}`);
        setLoading(false);
        return;
      }
      const story = new Story(JSON.stringify(storyJson));
      storyRef.current = story;

      // 3. Restore saved state if available
      if (user?.uid) {
        const saveSnap = await getDoc(
          doc(db, 'users', user.uid, 'progress', clientId)
        );
        const saved = saveSnap.data();
        if (saved?.inkStateJson && saved?.lastEpisodeId === episodeId) {
          try { story.state.LoadJson(saved.inkStateJson); } catch (_) {}
        }
        if (saved?.cluesFound?.length) setCluesFound(saved.cluesFound);
      }

      setLoading(false);
      advance(story);
    } catch (e) {
      console.error('Failed to init episode:', e);
      setLoading(false);
    }
  }

  // ── Advance story ──────────────────────────────────────────────────────────
  async function advance(
    story: Story,
    choiceIndex?: number,
    choiceText?: string,
  ) {
    // Record choice in named map BEFORE advancing (while tags.scene still = current knot)
    if (choiceIndex !== undefined && tags.scene) {
      await saveChoice(tags.scene, choiceIndex, choiceText ?? '');
    }

    if (choiceIndex !== undefined) {
      story.ChooseChoiceIndex(choiceIndex);
    }

    // Collect all text until next choice or end
    let text = '';
    while (story.canContinue) {
      text += story.Continue();
    }

    const nextTags = parseTags(story.currentTags ?? []);

    // Grant clues from tags
    if (nextTags.clues.length > 0) {
      setCluesFound(prev => {
        const next = [...prev];
        nextTags.clues.forEach(id => { if (!next.includes(id)) next.push(id); });
        return next;
      });
    }

    // Sync relationship variables → Firestore global relationships
    await syncRelationships(story);

    // Persist ink state + new clues
    await persistState(story, nextTags.clues);

    // Check for episode end
    const isEnd =
      nextTags.type === 'episode_end' ||
      (!story.canContinue && story.currentChoices.length === 0);

    if (isEnd) {
      await handleEpisodeEnd();
    } else {
      setDisplayText(text.trim());
      setTags(nextTags);
      setChoices(story.currentChoices.map((c, i) => ({ text: c.text, index: i })));
    }
  }

  // ── Save choice to named map ───────────────────────────────────────────────
  async function saveChoice(sceneKnotId: string, index: number, text: string) {
    if (!user?.uid) return;
    const progressRef = doc(db, 'users', user.uid, 'progress', clientId);
    const snap = await getDoc(progressRef);
    const existing = snap.data()?.choicesMade ?? {};
    await setDoc(
      progressRef,
      { choicesMade: { ...existing, [sceneKnotId]: { index, text, madeAt: Timestamp.now() } } },
      { merge: true }
    );
  }

  // ── Sync ink relationship vars → users/{uid}.relationships ────────────────
  async function syncRelationships(story: Story) {
    if (!user?.uid) return;
    const userRef  = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const rels: any[] = userSnap.data()?.relationships ?? [];

    let dirty = false;
    const updated = rels.map(r => {
      const varName = Object.entries(INK_VAR_TO_NPC).find(([, id]) => id === r.npcId)?.[0];
      if (!varName) return r;
      try {
        const inkVal = story.variablesState[varName] as number;
        if (typeof inkVal === 'number' && inkVal !== r.value) {
          dirty = true;
          return { ...r, value: Math.max(-100, Math.min(100, inkVal)) };
        }
      } catch (_) {}
      return r;
    });

    if (dirty) await setDoc(userRef, { relationships: updated }, { merge: true });
  }

  // ── Persist ink state to Firestore ────────────────────────────────────────
  async function persistState(story: Story, newClueIds: string[]) {
    if (!user?.uid) return;
    setSaving(true);
    try {
      const progressRef = doc(db, 'users', user.uid, 'progress', clientId);
      const update: Record<string, any> = {
        inkStateJson:  story.state.ToJson(),
        lastSeasonId:  seasonId,
        lastEpisodeId: episodeId,
        lastPlayedAt:  serverTimestamp(),
      };
      if (newClueIds.length > 0) update.cluesFound = arrayUnion(...newClueIds);
      await setDoc(progressRef, update, { merge: true });
    } finally {
      setSaving(false);
    }
  }

  // ── Episode end ────────────────────────────────────────────────────────────
  async function handleEpisodeEnd() {
    if (!user?.uid) return;
    const progressRef = doc(db, 'users', user.uid, 'progress', clientId);
    const snap  = await getDoc(progressRef);
    const played = (snap.data()?.episodesPlayedCount ?? 0) as number;
    await setDoc(
      progressRef,
      {
        completedEpisodes:   arrayUnion(episodeId),
        episodesPlayedCount: played + 1,
        inkStateJson:        null,   // clear so next episode starts fresh
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

  if (!storyRef.current) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Story not found.{'\n'}Run: node scripts/compile-ink.mjs
        </Text>
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
            {cluesFound.length} clue{cluesFound.length !== 1 ? 's' : ''} discovered.{'\n'}
            The investigation continues…
          </Text>
          <TouchableOpacity style={styles.completeBtn} onPress={() => router.back()}>
            <Text style={styles.completeBtnText}>Back to Case</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // ── Derive render mode ─────────────────────────────────────────────────────
  const isChoice   = choices.length > 0;
  const isDialogue = !isChoice && tags.type === 'dialogue';

  // ── Render scene ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.bgDark} />
      <View style={styles.overlay} />

      {/* Top bar */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.exitBtn}>
          <Text style={styles.exitText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{episodeTitle}</Text>
        <TouchableOpacity onPress={() => setShowClues(true)} style={styles.clueBtn}>
          <Text style={styles.clueIcon}>🔍</Text>
          {cluesFound.length > 0 && (
            <View style={styles.clueBadge}>
              <Text style={styles.clueBadgeText}>{cluesFound.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {saving && <View style={styles.savingPill}><ActivityIndicator size="small" color={Colors.accent} /></View>}

      {/* ── Image / narration — tap to advance ────────────────────────────── */}
      {!isChoice && !isDialogue && (
        <TouchableOpacity
          style={styles.tapZone}
          activeOpacity={1}
          onPress={() => storyRef.current && advance(storyRef.current)}
        >
          {displayText ? (
            <View style={styles.narrationBox}>
              <Text style={styles.narrationText}>{displayText}</Text>
              <Text style={styles.tapHintText}>Tap to continue</Text>
            </View>
          ) : (
            <View style={styles.tapHintWrap}>
              <Text style={styles.tapHintText}>Tap to continue</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* ── Dialogue — tap to advance ─────────────────────────────────────── */}
      {isDialogue && (
        <TouchableOpacity
          style={styles.tapZone}
          activeOpacity={1}
          onPress={() => storyRef.current && advance(storyRef.current)}
        >
          <View style={styles.dialogueBox}>
            {tags.speaker && (
              <Text style={styles.speakerName}>
                {NPC_NAMES[tags.speaker] ?? tags.speaker}
              </Text>
            )}
            <Text style={styles.dialogueText}>{displayText}</Text>
            <Text style={styles.tapHintText}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Choice — buttons ──────────────────────────────────────────────── */}
      {isChoice && (
        <View style={styles.choiceWrap}>
          {tags.speaker && (
            <Text style={styles.speakerName}>
              {NPC_NAMES[tags.speaker] ?? tags.speaker}
            </Text>
          )}
          {displayText ? (
            <Text style={styles.choiceContext}>{displayText}</Text>
          ) : null}
          <Text style={styles.choicePrompt}>What do you do?</Text>
          {choices.map(c => (
            <TouchableOpacity
              key={c.index}
              style={styles.choiceBtn}
              activeOpacity={0.75}
              onPress={() => storyRef.current && advance(storyRef.current, c.index, c.text)}
            >
              <Text style={styles.choiceBtnText}>{c.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Clue review modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showClues}
        transparent
        animationType="slide"
        onRequestClose={() => setShowClues(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔍 Case Files</Text>
              <TouchableOpacity onPress={() => setShowClues(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {cluesFound.length === 0 ? (
              <Text style={styles.noClues}>No clues discovered yet.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {cluesFound.map((id, i) => (
                  <View key={id} style={styles.clueItem}>
                    <Text style={styles.clueItemNum}>{i + 1}</Text>
                    <Text style={styles.clueItemId}>{id.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  bgDark:    { ...StyleSheet.absoluteFillObject, backgroundColor: '#0D0D0D' },
  overlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  exitBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  exitText:      { fontSize: 18, color: Colors.textMuted },
  topTitle:      { fontSize: 13, color: Colors.textMuted, fontWeight: '600', flex: 1, textAlign: 'center' },
  clueBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clueIcon:      { fontSize: 18 },
  clueBadge:     { position: 'absolute', top: 0, right: 0, backgroundColor: Colors.accent, borderRadius: 8, minWidth: 16, paddingHorizontal: 3, alignItems: 'center' },
  clueBadgeText: { fontSize: 9, fontWeight: '800', color: '#0D0D0D' },
  savingPill:    { position: 'absolute', top: 60, right: 16 },

  tapZone:      { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  tapHintWrap:  { padding: 32, alignItems: 'center' },
  tapHintText:  { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 6 },

  narrationBox: {
    backgroundColor: 'rgba(13,13,13,0.85)',
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 24, paddingBottom: 48, gap: 10,
  },
  narrationText: { fontSize: 16, color: Colors.textLight, lineHeight: 26, fontStyle: 'italic' },

  dialogueBox: {
    backgroundColor: 'rgba(13,13,13,0.93)',
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 24, paddingBottom: 48, gap: 10,
  },
  speakerName:  { fontSize: 12, color: Colors.accent, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  dialogueText: { fontSize: 17, color: Colors.textLight, lineHeight: 27 },

  choiceWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(13,13,13,0.96)',
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 20, paddingBottom: 48, gap: 10,
  },
  choiceContext: { fontSize: 15, color: Colors.textLight, lineHeight: 22, marginBottom: 4 },
  choicePrompt:  { fontSize: 11, color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  choiceBtn:     { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent + '55', borderRadius: 12, padding: 16 },
  choiceBtnText: { fontSize: 15, color: Colors.textLight, lineHeight: 22 },

  completeWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  completeIcon:     { fontSize: 56 },
  completeTitle:    { fontSize: 26, fontWeight: '800', color: Colors.textLight },
  completeSubtitle: { fontSize: 15, color: Colors.accent, fontStyle: 'italic', textAlign: 'center' },
  completeSub:      { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginTop: 8 },
  completeBtn:      { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 16 },
  completeBtnText:  { fontSize: 16, fontWeight: '800', color: '#0D0D0D' },
  errorText:        { color: Colors.textMuted, textAlign: 'center', padding: 40, lineHeight: 24 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '70%' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: Colors.textLight },
  modalClose:   { fontSize: 18, color: Colors.textMuted },
  noClues:      { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
  clueItem:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border },
  clueItemNum:  { fontSize: 12, color: Colors.accent, fontWeight: '800', width: 20 },
  clueItemId:   { fontSize: 14, color: Colors.textLight, flex: 1, textTransform: 'capitalize' },
});
