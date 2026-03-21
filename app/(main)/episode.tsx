// episode.tsx — Graph-based Episode Player
//
// Architecture: EpisodeGraph JSON (Firebase Storage or bundled) defines all scenes.
// advance(sceneId) traverses the graph: apply effects/clues → play video → choices or next.
//
// Node types:
//   VideoScene     → plays video (or dark bg if null), then choices overlay or auto-advance
//   ImageScene     → static bg image + optional narration text, tap anywhere to advance
//   DialogueScene  → NPC portrait/lip-sync video + speaker name + subtitle, tap to advance
//   MinigameScene  → navigates to /(main)/minigame, returns via minigameResult service
//   EpisodeEndScene → marks episode complete, saves to Firestore
//
// Memory map (EpisodeState) lives in epStateRef — saved to Firestore at every savepoint.
// Savepoints: after each scene entry, after each choice, after each minigame result.

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  SafeAreaView, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  doc, getDoc, setDoc, serverTimestamp, arrayUnion,
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';
import { INK_VAR_TO_NPC } from '@/config/storyMap';
import { consumeMinigameResult } from '@/services/minigameResult';
import { loadEpisodeGraph } from '@/services/graphLoader';
import { resolveLocalSceneAsset } from '@/services/localAssets';
import {
  EpisodeGraph, EpisodeState, SceneNode,
  VideoScene, ImageScene, DialogueScene, MinigameScene, ChoiceOption,
} from '@/types/episode';

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

  const graphRef        = useRef<EpisodeGraph | null>(null);
  const epStateRef      = useRef<EpisodeState>({
    currentSceneId: '',
    variables:      {},
    cluesFound:     [],
    choicesMade:    {},
  });
  const pendingMinigame = useRef(false);
  const audioRef        = useRef<Audio.Sound | null>(null);

  const [episodeTitle, setEpisodeTitle] = useState('');
  const [loading,      setLoading]      = useState(true);
  const [complete,     setComplete]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Current scene
  const [scene,         setScene]         = useState<SceneNode | null>(null);
  const [sceneId,       setSceneId]       = useState('');
  const [videoUri,      setVideoUri]      = useState<string | null>(null);
  const [showChoices,   setShowChoices]   = useState(false);

  // Image / dialogue scene state — string = remote URL, number = local require() asset
  const [imageBgUri,    setImageBgUri]    = useState<string | number | null>(null);
  const [dialogueText,  setDialogueText]  = useState('');
  const [dialogueName,  setDialogueName]  = useState('');
  const [sceneType,     setSceneType]     = useState<'video' | 'image' | 'dialogue' | 'minigame' | 'end'>('video');

  // Clue tracking
  const [cluesFound, setCluesFound] = useState<string[]>([]);
  const [showClues,  setShowClues]  = useState(false);

  // ── Init & cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId || !seasonId || !episodeId) return;
    initEpisode();
    return () => { stopAudio(); };
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
      // 1. Fetch episode doc for title + remote graph URL
      const epSnap = await getDoc(
        doc(db, 'clients', clientId, 'seasons', seasonId, 'episodes', episodeId)
      );
      let graphUrl: string | null = null;
      if (epSnap.exists()) {
        const d = epSnap.data();
        setEpisodeTitle(d.title ?? '');
        graphUrl = d.graphUrl ?? null;
      }

      // 2. Init NPC relationships (seeds missing NPCs on first play)
      if (user?.uid) await initRelationships(clientId, user.uid);

      // 3. Load episode graph (remote → bundled fallback)
      const graph = await loadEpisodeGraph(clientId, episodeId, graphUrl);
      if (!graph) {
        console.error(`No graph found: ${clientId}/${episodeId}`);
        setLoading(false);
        return;
      }
      graphRef.current = graph;

      // 4. Restore saved state
      let startSceneId = graph.startScene;
      if (user?.uid) {
        const snap  = await getDoc(doc(db, 'users', user.uid, 'progress', clientId));
        const saved = snap.data();
        if (saved?.graphStateJson && saved?.lastEpisodeId === episodeId) {
          try {
            const restored = JSON.parse(saved.graphStateJson) as EpisodeState;
            epStateRef.current = restored;
            setCluesFound([...restored.cluesFound]);
            startSceneId = restored.currentSceneId;
          } catch (_) {}
        } else if (saved?.cluesFound?.length) {
          setCluesFound(saved.cluesFound);
        }
      }

      setLoading(false);
      advance(startSceneId);
    } catch (e) {
      console.error('initEpisode failed:', e);
      setLoading(false);
    }
  }

  // ── Mini-game return ───────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!pendingMinigame.current || !scene) return;
      pendingMinigame.current = false;
      const result = consumeMinigameResult();
      const mg = scene as MinigameScene;
      if (result === 'win') {
        applyEffects(mg.effectOnWin);
        if (mg.clueOnWin) applyClues([mg.clueOnWin]);
      } else {
        applyEffects(mg.effectOnLose);
      }
      saveProgress();
      advance(result === 'win' ? mg.onWin : mg.onLose);
    }, [scene])
  );

  // ── Audio helpers ─────────────────────────────────────────────────────────
  async function stopAudio() {
    if (audioRef.current) {
      try { await audioRef.current.stopAsync(); await audioRef.current.unloadAsync(); } catch (_) {}
      audioRef.current = null;
    }
  }

  async function playAudio(url: string) {
    await stopAudio();
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      audioRef.current = sound;
      await sound.playAsync();
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  // ── Core graph traversal ──────────────────────────────────────────────────
  function advance(toSceneId: string) {
    const graph = graphRef.current;
    if (!graph) return;

    const node = graph.scenes[toSceneId];
    if (!node) {
      console.error(`Scene not found: ${toSceneId}`);
      return;
    }

    epStateRef.current.currentSceneId = toSceneId;
    setSceneId(toSceneId);
    setScene(node);
    setShowChoices(false);
    stopAudio();

    if (node.type === 'episode_end') {
      setSceneType('end');
      handleEpisodeEnd();
      return;
    }

    if (node.type === 'minigame') {
      const mg = node as MinigameScene;
      setSceneType('minigame');
      saveProgress();
      pendingMinigame.current = true;
      router.push({
        pathname: '/(main)/minigame',
        params: {
          minigameType:   mg.minigameType,
          minigameConfig: JSON.stringify(mg.minigameConfig ?? {}),
          clientId, seasonId, episodeId,
        },
      });
      return;
    }

    if (node.type === 'image') {
      const img = node as ImageScene;
      setSceneType('image');
      applyEffects(img.effects);
      applyClues(img.clues);
      saveProgress();
      const localImg = resolveLocalSceneAsset(clientId, seasonId, episodeId, toSceneId);
      setImageBgUri(img.imageUrl ?? localImg ?? null);
      setVideoUri(null);
      setDialogueText(img.text ?? '');
      setDialogueName('');
      if (img.audioUrl) playAudio(img.audioUrl);
      return;
    }

    if (node.type === 'dialogue') {
      const dl = node as DialogueScene;
      setSceneType('dialogue');
      applyEffects(dl.effects);
      applyClues(dl.clues);
      saveProgress();
      setDialogueText(dl.text);
      setDialogueName(dl.speaker);
      // Dialogue can have a lip-sync video OR a portrait image
      setVideoUri(dl.videoUrl ?? null);
      setImageBgUri(dl.imageUrl ?? null);
      if (dl.audioUrl) playAudio(dl.audioUrl);
      return;
    }

    // VideoScene (default)
    setSceneType('video');
    const vs = node as VideoScene;
    applyEffects(vs.effects);
    applyClues(vs.clues);
    saveProgress();
    setVideoUri(vs.videoUrl ?? null);
    setImageBgUri(null);
    setDialogueText('');
    setDialogueName('');

    if (!vs.videoUrl) {
      // No video yet — show choices immediately or chain to next scene
      if (vs.choices?.length) {
        setShowChoices(true);
      } else if (vs.next) {
        advance(vs.next);
      }
    }
    // With video: onVideoEnd fires → showChoices or advance(next)
  }

  function onVideoEnd() {
    const vs = scene as VideoScene;
    if (vs?.choices?.length) {
      setShowChoices(true);
    } else if (vs?.next) {
      advance(vs.next);
    }
  }

  function onChoice(option: ChoiceOption) {
    epStateRef.current.choicesMade[epStateRef.current.currentSceneId] = {
      text: option.text,
      next: option.next,
      ts:   Date.now(),
    };
    applyEffects(option.effects);
    applyClues(option.clues);
    saveProgress();
    advance(option.next);
  }

  // Tap-to-advance for image and dialogue scenes
  function onTapScene() {
    if (sceneType === 'image') {
      const img = scene as ImageScene;
      if (img?.next) advance(img.next);
      return;
    }
    if (sceneType === 'dialogue') {
      const dl = scene as DialogueScene;
      if (dl?.choices?.length) {
        setShowChoices(true);
      } else if (dl?.next) {
        advance(dl.next);
      }
    }
  }

  // ── Variable effects / clues ───────────────────────────────────────────────
  function applyEffects(effects?: Record<string, number>) {
    if (!effects) return;
    const vars = epStateRef.current.variables;
    for (const [k, v] of Object.entries(effects)) {
      vars[k] = Math.max(-100, Math.min(100, (vars[k] ?? 0) + v));
    }
    syncRelationshipsToFirestore();
  }

  function applyClues(clues?: string[]) {
    if (!clues?.length) return;
    const found = epStateRef.current.cluesFound;
    clues.forEach(c => { if (!found.includes(c)) found.push(c); });
    setCluesFound([...epStateRef.current.cluesFound]);
  }

  // ── Firestore helpers ─────────────────────────────────────────────────────
  async function syncRelationshipsToFirestore() {
    if (!user?.uid) return;
    const userRef  = doc(db, 'users', user.uid);
    const snap     = await getDoc(userRef);
    const rels: any[] = snap.data()?.relationships ?? [];
    const vars     = epStateRef.current.variables;
    let dirty = false;
    const updated = rels.map(r => {
      const varName = Object.entries(INK_VAR_TO_NPC).find(([, id]) => id === r.npcId)?.[0];
      if (!varName || !(varName in vars)) return r;
      const val = vars[varName];
      if (typeof val === 'number' && val !== r.value) {
        dirty = true;
        return { ...r, value: Math.max(-100, Math.min(100, val)) };
      }
      return r;
    });
    if (dirty) await setDoc(userRef, { relationships: updated }, { merge: true });
  }

  async function saveProgress() {
    if (!user?.uid) return;
    // Snapshot synchronously before any await (epStateRef is mutated in place)
    const graphStateJson = JSON.stringify(epStateRef.current);
    const cluesSnapshot  = [...epStateRef.current.cluesFound];
    setSaving(true);
    try {
      const ref    = doc(db, 'users', user.uid, 'progress', clientId);
      const update: Record<string, any> = {
        graphStateJson,
        lastSeasonId:  seasonId,
        lastEpisodeId: episodeId,
        lastPlayedAt:  serverTimestamp(),
      };
      if (cluesSnapshot.length > 0) update.cluesFound = arrayUnion(...cluesSnapshot);
      await setDoc(ref, update, { merge: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleEpisodeEnd() {
    if (!user?.uid) return;
    const ref  = doc(db, 'users', user.uid, 'progress', clientId);
    const snap = await getDoc(ref);
    const played = (snap.data()?.episodesPlayedCount ?? 0) as number;
    await setDoc(
      ref,
      {
        completedEpisodes:   arrayUnion(episodeId),
        episodesPlayedCount: played + 1,
        graphStateJson:      null,
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

  if (!graphRef.current) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Episode graph not found.{'\n'}Check assets/episodes/ or Firestore graphUrl.</Text>
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

  const vs = scene as VideoScene | null;
  const dl = scene as DialogueScene | null;

  // Choices come from VideoScene or DialogueScene
  const activeChoices = (sceneType === 'video' ? vs?.choices : dl?.choices) ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Background layer */}
      {sceneType === 'video' && videoUri
        ? <SceneVideo uri={videoUri} onEnd={onVideoEnd} />
        : sceneType === 'dialogue' && videoUri
          ? <SceneVideo uri={videoUri} onEnd={() => {}} />
          : imageBgUri
            ? <Image
                source={typeof imageBgUri === 'number' ? imageBgUri : { uri: imageBgUri }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            : <View style={styles.bgDark} />
      }
      <View style={styles.overlay} />

      {/* Tap-to-advance hitbox for image / dialogue scenes */}
      {(sceneType === 'image' || sceneType === 'dialogue') && !showChoices && (
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onTapScene} />
      )}

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

      {saving && (
        <View style={styles.savingPill}>
          <ActivityIndicator size="small" color={Colors.accent} />
        </View>
      )}

      {/* Skip button — shown when cinematic video is playing */}
      {sceneType === 'video' && videoUri && !showChoices && (
        <TouchableOpacity style={styles.skipBtn} onPress={onVideoEnd}>
          <Text style={styles.skipText}>Skip ›</Text>
        </TouchableOpacity>
      )}

      {/* Dialogue overlay — speaker name + text (image or dialogue scene) */}
      {(sceneType === 'dialogue' || (sceneType === 'image' && dialogueText)) && !showChoices && (
        <View style={styles.dialogueWrap} pointerEvents="none">
          {dialogueName ? (
            <Text style={styles.speakerName}>{dialogueName}</Text>
          ) : null}
          <Text style={styles.dialogueText}>{dialogueText}</Text>
          <Text style={styles.tapHint}>Tap to continue</Text>
        </View>
      )}

      {/* Choice overlay — slides up after video/dialogue ends */}
      {showChoices && activeChoices.length > 0 && (
        <View style={styles.choiceWrap}>
          <Text style={styles.choicePrompt}>What do you do?</Text>
          {activeChoices.map((opt, i) => (
            <TouchableOpacity key={i} style={styles.choiceBtn} activeOpacity={0.75}
              onPress={() => onChoice(opt)}>
              <Text style={styles.choiceBtnText}>{opt.text}</Text>
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

  choiceWrap:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,13,13,0.96)', borderTopWidth: 1, borderTopColor: Colors.border, padding: 20, paddingBottom: 48, gap: 10 },
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

  // Dialogue / image scene
  dialogueWrap:  { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,13,13,0.88)', borderTopWidth: 1, borderTopColor: Colors.border, padding: 20, paddingBottom: 40, gap: 8 },
  speakerName:   { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 1.5, textTransform: 'uppercase' },
  dialogueText:  { fontSize: 16, color: Colors.textLight, lineHeight: 24 },
  tapHint:       { fontSize: 11, color: Colors.textMuted, alignSelf: 'flex-end', marginTop: 4 },

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
