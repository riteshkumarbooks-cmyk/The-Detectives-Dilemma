// episode.tsx — inkjs-powered Episode Player
//
// Scene rendering pipeline (driven by Ink tags):
//   # type: image      → static bg, tap to advance
//   # type: dialogue   → NPC lip-sync video (S3) + text overlay, tap to advance
//   # type: video      → cinematic video (S3), auto-advances on completion
//   # type: minigame   → navigates to /(main)/minigame, returns via minigameResult service
//   # type: episode_end → marks episode complete
//
// Ink advance model (ONE Continue() per tap):
//   • story.Continue() returns ONE paragraph + its tags
//   • Tags carry forward when a line has no type tag (continuation of same scene)
//   • Empty lines auto-advance internally
//   • Choices appear via story.currentChoices after a Continue()
//
// Video URL pattern (requires mediaBaseUrl on Firestore episode doc):
//   dialogue  → mediaBaseUrl + sceneId + '_lipsync.mp4'
//   video     → mediaBaseUrl + sceneId + '_video.mp4'
//
// Mini-game round-trip:
//   episode detects minigame scene + currentChoices [WIN, LOSE]
//   → router.push(/(main)/minigame)
//   → minigame calls setMinigameResult('win'|'lose') → router.back()
//   → useFocusEffect → story.ChooseChoiceIndex(0=win, 1=lose)

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Story } from 'inkjs';
import {
  doc, getDoc, setDoc, serverTimestamp, arrayUnion, Timestamp,
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';
import { getStoryJson, INK_VAR_TO_NPC } from '@/config/storyMap';
import { consumeMinigameResult } from '@/services/minigameResult';

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
  scene?:         string;
  type?:          string;
  speaker?:       string;
  emotion?:       string;
  minigame?:      string;
  minigameConfig?: string;
  clues:          string[];
}

function parseTags(tags: string[]): ParsedTags {
  const r: ParsedTags = { clues: [] };
  for (const t of tags) {
    const i = t.indexOf(':');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (key === 'scene')           r.scene         = val;
    if (key === 'type')            r.type          = val;
    if (key === 'speaker')         r.speaker       = val;
    if (key === 'emotion')         r.emotion       = val;
    if (key === 'minigame')        r.minigame      = val;
    if (key === 'minigame_config') r.minigameConfig = val;
    if (key === 'clue')            r.clues.push(val);
  }
  return r;
}

// Tags carry forward within a scene — merge new tags onto previous
function mergeTags(prev: ParsedTags, next: ParsedTags): ParsedTags {
  return {
    scene:         next.scene         ?? prev.scene,
    type:          next.type          ?? prev.type,
    speaker:       next.speaker       ?? prev.speaker,
    emotion:       next.emotion       ?? prev.emotion,
    minigame:      next.minigame      ?? prev.minigame,
    minigameConfig: next.minigameConfig ?? prev.minigameConfig,
    clues:         next.clues,   // always fresh — don't accumulate across lines
  };
}

// ── Scene video component ──────────────────────────────────────────────────
function SceneVideo({ uri, onEnd }: { uri: string; onEnd: () => void }) {
  const player = useVideoPlayer(uri, p => { p.loop = false; p.play(); });

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      if (!isPlaying && player.currentTime > 0) onEnd();
    });
    return () => sub.remove();
  }, [player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFillObject}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────
export default function EpisodeScreen() {
  const { clientId, seasonId, episodeId } = useLocalSearchParams<{
    clientId: string; seasonId: string; episodeId: string;
  }>();
  const { user } = useAuth();
  const router   = useRouter();

  const storyRef          = useRef<Story | null>(null);
  const pendingMinigame   = useRef(false);
  const mediaBaseUrlRef   = useRef<string | null>(null);

  const [episodeTitle, setEpisodeTitle] = useState('');
  const [loading,      setLoading]      = useState(true);
  const [complete,     setComplete]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Current scene rendering state
  const [displayText,  setDisplayText]  = useState('');
  const [tags,         setTags]         = useState<ParsedTags>({ clues: [] });
  const [choices,      setChoices]      = useState<{ text: string; index: number }[]>([]);
  const [videoUri,     setVideoUri]     = useState<string | null>(null);
  const [videoAutoEnd, setVideoAutoEnd] = useState(false);

  // Persistent progress
  const [cluesFound, setCluesFound] = useState<string[]>([]);
  const [showClues,  setShowClues]  = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId || !seasonId || !episodeId) return;
    initEpisode();
  }, [clientId, seasonId, episodeId]);

  // Seeds any NPCs for this client that are not yet in the user's relationships[]
  async function initRelationships(cId: string, uid: string) {
    try {
      const npcSnap  = await getDocs(query(collection(db, 'npcs'), where('appearsInClients', 'array-contains', cId)));
      const userRef  = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      const existing: any[] = userSnap.data()?.relationships ?? [];
      const existingIds = new Set(existing.map((r: any) => r.npcId));
      const newRels = npcSnap.docs
        .filter(d => !existingIds.has(d.id))
        .map(d => ({ npcId: d.id, value: d.data().initialValue ?? 0, status: d.data().initialStatus ?? 'Neutral' }));
      if (newRels.length > 0) {
        await setDoc(userRef, { relationships: [...existing, ...newRels] }, { merge: true });
      }
    } catch (e) {
      console.error('initRelationships failed:', e);
    }
  }

  async function initEpisode() {
    try {
      const epSnap = await getDoc(
        doc(db, 'clients', clientId, 'seasons', seasonId, 'episodes', episodeId)
      );
      if (epSnap.exists()) {
        const d = epSnap.data();
        setEpisodeTitle(d.title ?? '');
        mediaBaseUrlRef.current = d.mediaBaseUrl ?? null;
      }

      const storyJson = getStoryJson(clientId, episodeId);
      if (!storyJson) {
        console.error(`No story: ${clientId}/${episodeId}`);
        setLoading(false);
        return;
      }
      const story = new Story(JSON.stringify(storyJson));
      storyRef.current = story;

      if (user?.uid) {
        await initRelationships(clientId, user.uid);
        const snap  = await getDoc(doc(db, 'users', user.uid, 'progress', clientId));
        const saved = snap.data();
        if (saved?.inkStateJson && saved?.lastEpisodeId === episodeId) {
          try { story.state.LoadJson(saved.inkStateJson); } catch (_) {}
        }
        if (saved?.cluesFound?.length) setCluesFound(saved.cluesFound);
      }

      setLoading(false);
      doAdvance(story, { clues: [] });   // seed with empty prev tags
    } catch (e) {
      console.error('initEpisode failed:', e);
      setLoading(false);
    }
  }

  // ── Mini-game return ───────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!pendingMinigame.current || !storyRef.current) return;
      pendingMinigame.current = false;
      const result = consumeMinigameResult();
      doAdvance(storyRef.current, tags, result === 'win' ? 0 : 1, result ?? 'lose');
    }, [tags])
  );

  // ── Core advance (ONE Continue() per call) ────────────────────────────────
  async function doAdvance(
    story:       Story,
    prevTags:    ParsedTags,
    choiceIndex?: number,
    choiceText?:  string,
  ) {
    // Record choice before advancing
    if (choiceIndex !== undefined && prevTags.scene) {
      await saveChoice(prevTags.scene, choiceIndex, choiceText ?? '');
    }
    if (choiceIndex !== undefined) {
      story.ChooseChoiceIndex(choiceIndex);
    }

    // Nothing more to do
    if (!story.canContinue && story.currentChoices.length === 0) {
      await handleEpisodeEnd();
      return;
    }

    // Advance ONE paragraph
    const text    = story.canContinue ? story.Continue() : '';
    const newTags = parseTags(story.currentTags ?? []);
    const active  = mergeTags(prevTags, newTags);

    // Grant clues
    if (newTags.clues.length > 0) {
      setCluesFound(prev => {
        const next = [...prev];
        newTags.clues.forEach(id => { if (!next.includes(id)) next.push(id); });
        return next;
      });
    }

    await syncRelationships(story);
    await persistState(story, newTags.clues);

    // Episode end
    if (active.type === 'episode_end') {
      await handleEpisodeEnd();
      return;
    }

    // Mini-game: empty text + minigame type + choices [WIN, LOSE]
    if (active.type === 'minigame' && story.currentChoices.length > 0) {
      setTags(active);  // keep for choice recording on return
      pendingMinigame.current = true;
      router.push({
        pathname: '/(main)/minigame',
        params: {
          minigameType:   active.minigame   ?? 'hidden_objects',
          minigameConfig: active.minigameConfig ?? '{}',
          clientId, seasonId, episodeId,
        },
      });
      return;
    }

    // Empty line (no text, no choices, still can continue) — skip automatically
    if (!text.trim() && story.canContinue && story.currentChoices.length === 0) {
      doAdvance(story, active);
      return;
    }

    // Resolve video URI
    const base = mediaBaseUrlRef.current;
    let vid: string | null = null;
    if (base && active.scene) {
      if      (active.type === 'dialogue') vid = `${base}${active.scene}_lipsync.mp4`;
      else if (active.type === 'video')    vid = `${base}${active.scene}_video.mp4`;
    }

    // Update render state
    setDisplayText(text.trim());
    setTags(active);
    setChoices(story.currentChoices.map((c, i) => ({ text: c.text, index: i })));
    setVideoUri(vid);
    setVideoAutoEnd(active.type === 'video');
  }

  // ── Firestore helpers ─────────────────────────────────────────────────────
  async function saveChoice(knotId: string, index: number, text: string) {
    if (!user?.uid) return;
    const ref  = doc(db, 'users', user.uid, 'progress', clientId);
    const snap = await getDoc(ref);
    const existing = snap.data()?.choicesMade ?? {};
    await setDoc(
      ref,
      { choicesMade: { ...existing, [knotId]: { index, text, madeAt: Timestamp.now() } } },
      { merge: true }
    );
  }

  async function syncRelationships(story: Story) {
    if (!user?.uid) return;
    const userRef  = doc(db, 'users', user.uid);
    const snap     = await getDoc(userRef);
    const rels: any[] = snap.data()?.relationships ?? [];
    let dirty = false;
    const updated = rels.map(r => {
      const varName = Object.entries(INK_VAR_TO_NPC).find(([, id]) => id === r.npcId)?.[0];
      if (!varName) return r;
      try {
        const val = story.variablesState[varName] as number;
        if (typeof val === 'number' && val !== r.value) {
          dirty = true;
          return { ...r, value: Math.max(-100, Math.min(100, val)) };
        }
      } catch (_) {}
      return r;
    });
    if (dirty) await setDoc(userRef, { relationships: updated }, { merge: true });
  }

  async function persistState(story: Story, newClues: string[]) {
    if (!user?.uid) return;
    setSaving(true);
    try {
      const ref    = doc(db, 'users', user.uid, 'progress', clientId);
      const update: Record<string, any> = {
        inkStateJson:  story.state.ToJson(),
        lastSeasonId:  seasonId,
        lastEpisodeId: episodeId,
        lastPlayedAt:  serverTimestamp(),
      };
      if (newClues.length > 0) update.cluesFound = arrayUnion(...newClues);
      await setDoc(ref, update, { merge: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleEpisodeEnd() {
    if (!user?.uid) return;
    const ref    = doc(db, 'users', user.uid, 'progress', clientId);
    const snap   = await getDoc(ref);
    const played = (snap.data()?.episodesPlayedCount ?? 0) as number;
    await setDoc(
      ref,
      {
        completedEpisodes:   arrayUnion(episodeId),
        episodesPlayedCount: played + 1,
        inkStateJson:        null,
        lastPlayedAt:        serverTimestamp(),
      },
      { merge: true }
    );
    setComplete(true);
  }

  // ── Render guards ──────────────────────────────────────────────────────────
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
        <Text style={styles.errorText}>Story not found.{'\n'}Run: node scripts/compile-ink.mjs</Text>
      </View>
    );
  }

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
  const story      = storyRef.current;
  const isChoice   = choices.length > 0;
  const isDialogue = !isChoice && tags.type === 'dialogue';
  const isCinematic = !isChoice && tags.type === 'video';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Background video (lip-sync or cinematic) or dark fill */}
      {videoUri
        ? <SceneVideo uri={videoUri} onEnd={() => { if (videoAutoEnd) doAdvance(story, tags); }} />
        : <View style={styles.bgDark} />
      }
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

      {/* Cinematic: skip button only */}
      {isCinematic && (
        <TouchableOpacity style={styles.skipBtn} onPress={() => doAdvance(story, tags)}>
          <Text style={styles.skipText}>Skip ›</Text>
        </TouchableOpacity>
      )}

      {/* Image / narration: tap zone */}
      {!isChoice && !isDialogue && !isCinematic && (
        <TouchableOpacity style={styles.tapZone} activeOpacity={1}
          onPress={() => doAdvance(story, tags)}>
          {displayText
            ? <View style={styles.narrationBox}>
                <Text style={styles.narrationText}>{displayText}</Text>
                <Text style={styles.tapHintText}>Tap to continue</Text>
              </View>
            : <View style={styles.tapHintWrap}>
                <Text style={styles.tapHintText}>Tap to continue</Text>
              </View>
          }
        </TouchableOpacity>
      )}

      {/* Dialogue: tap zone with speaker box */}
      {isDialogue && (
        <TouchableOpacity style={styles.tapZone} activeOpacity={1}
          onPress={() => doAdvance(story, tags)}>
          <View style={styles.dialogueBox}>
            {tags.speaker && (
              <Text style={styles.speakerName}>{NPC_NAMES[tags.speaker] ?? tags.speaker}</Text>
            )}
            <Text style={styles.dialogueText}>{displayText}</Text>
            <Text style={styles.tapHintText}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Choice: button list */}
      {isChoice && (
        <View style={styles.choiceWrap}>
          {tags.speaker && (
            <Text style={styles.speakerName}>{NPC_NAMES[tags.speaker] ?? tags.speaker}</Text>
          )}
          {displayText ? <Text style={styles.choiceContext}>{displayText}</Text> : null}
          <Text style={styles.choicePrompt}>What do you do?</Text>
          {choices.map(c => (
            <TouchableOpacity key={c.index} style={styles.choiceBtn} activeOpacity={0.75}
              onPress={() => doAdvance(story, tags, c.index, c.text)}>
              <Text style={styles.choiceBtnText}>{c.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Clue review modal */}
      <Modal visible={showClues} transparent animationType="slide" onRequestClose={() => setShowClues(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔍 Case Files</Text>
              <TouchableOpacity onPress={() => setShowClues(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {cluesFound.length === 0
              ? <Text style={styles.noClues}>No clues discovered yet.</Text>
              : <ScrollView showsVerticalScrollIndicator={false}>
                  {cluesFound.map((id, i) => (
                    <View key={id} style={styles.clueItem}>
                      <Text style={styles.clueItemNum}>{i + 1}</Text>
                      <Text style={styles.clueItemId}>{id.replace(/_/g, ' ')}</Text>
                    </View>
                  ))}
                </ScrollView>
            }
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
  overlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },

  topBar:        { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  exitBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  exitText:      { fontSize: 18, color: Colors.textMuted },
  topTitle:      { fontSize: 13, color: Colors.textMuted, fontWeight: '600', flex: 1, textAlign: 'center' },
  clueBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  clueIcon:      { fontSize: 18 },
  clueBadge:     { position: 'absolute', top: 0, right: 0, backgroundColor: Colors.accent, borderRadius: 8, minWidth: 16, paddingHorizontal: 3, alignItems: 'center' },
  clueBadgeText: { fontSize: 9, fontWeight: '800', color: '#0D0D0D' },
  savingPill:    { position: 'absolute', top: 60, right: 16 },

  skipBtn:  { position: 'absolute', top: 60, right: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  skipText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },

  tapZone:      { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  tapHintWrap:  { padding: 32, alignItems: 'center' },
  tapHintText:  { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 6 },
  narrationBox: { backgroundColor: 'rgba(13,13,13,0.85)', borderTopWidth: 1, borderTopColor: Colors.border, padding: 24, paddingBottom: 48, gap: 10 },
  narrationText:{ fontSize: 16, color: Colors.textLight, lineHeight: 26, fontStyle: 'italic' },
  dialogueBox:  { backgroundColor: 'rgba(13,13,13,0.88)', borderTopWidth: 1, borderTopColor: Colors.border, padding: 24, paddingBottom: 48, gap: 10 },
  speakerName:  { fontSize: 12, color: Colors.accent, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  dialogueText: { fontSize: 17, color: Colors.textLight, lineHeight: 27 },

  choiceWrap:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,13,13,0.96)', borderTopWidth: 1, borderTopColor: Colors.border, padding: 20, paddingBottom: 48, gap: 10 },
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
