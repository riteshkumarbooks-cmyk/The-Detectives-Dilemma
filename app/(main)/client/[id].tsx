import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection, getDocs, getDoc, doc, orderBy, query, where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Episode {
  id:         string;
  title:      string;
  order:      number;
  isLocked:   boolean;
  isComplete: boolean;
  inProgress: boolean;
}

interface Season {
  id:       string;
  title:    string;
  order:    number;
  episodes: Episode[];
}

interface ClientDetail {
  name:      string;
  tagline:   string;
  avatarUrl: string | null;
  seasons:   Season[];
}

interface ClueDetail {
  id:          string;
  title:       string;
  description: string;
  type:        string;
  importance:  string;
}

interface NpcRel {
  npcId: string;
  name:  string;
  role:  string;
  value: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOCAL_AVATARS: Record<string, ReturnType<typeof require>> = {
  'duchess-margaux': require('../../../assets/clients/duchess-margaux/margaux-avatar.png'),
};

function relLabel(v: number): { label: string; color: string } {
  if (v >= 50)  return { label: 'Trusted',  color: Colors.success };
  if (v >= 10)  return { label: 'Friendly', color: '#8BC34A' };
  if (v >= -10) return { label: 'Neutral',  color: Colors.textMuted };
  if (v >= -50) return { label: 'Wary',     color: '#FF9800' };
  return              { label: 'Hostile',  color: Colors.danger };
}

// -100..100 → 0..100 for bar width %
function relBarPct(v: number) { return Math.max(0, Math.min(100, v + 100)) / 2; }

type InnerTab = 'episodes' | 'case_files' | 'gallery';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ClientDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router   = useRouter();

  const [client,            setClient]            = useState<ClientDetail | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [progressLoading,   setProgressLoading]   = useState(false);
  const [activeTab,         setActiveTab]         = useState<InnerTab>('episodes');
  const [expandedSeason,    setExpandedSeason]    = useState<string | null>(null);

  // ── Progress state ─────────────────────────────────────────────────────────
  const [completedEpisodes, setCompletedEpisodes] = useState<string[]>([]);
  const [lastEpisodeId,     setLastEpisodeId]     = useState<string | null>(null);
  const [hasInkState,       setHasInkState]       = useState(false);
  const [clues,             setClues]             = useState<ClueDetail[]>([]);
  const [relationships,     setRelationships]     = useState<NpcRel[]>([]);

  useEffect(() => { if (id) fetchClient(); }, [id]);
  useEffect(() => { if (id && user?.uid) fetchProgress(); }, [id, user?.uid]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchClient() {
    try {
      const clientSnap = await getDoc(doc(db, 'clients', id));
      if (!clientSnap.exists()) { setLoading(false); return; }
      const d = clientSnap.data();

      const seasonsSnap = await getDocs(
        query(collection(db, 'clients', id, 'seasons'), orderBy('order'))
      );

      const seasons: Season[] = await Promise.all(
        seasonsSnap.docs.map(async seasonDoc => {
          const sd = seasonDoc.data();
          const episodesSnap = await getDocs(
            query(collection(db, 'clients', id, 'seasons', seasonDoc.id, 'episodes'), orderBy('order'))
          );
          const episodes: Episode[] = episodesSnap.docs.map(epDoc => {
            const ed = epDoc.data();
            return {
              id: epDoc.id, title: `Ep ${ed.order} · ${ed.title}`, order: ed.order,
              isLocked: false, isComplete: false, inProgress: false,
            };
          });
          return { id: seasonDoc.id, title: sd.title, order: sd.order, episodes };
        })
      );

      setClient({ name: d.name, tagline: d.tagline, avatarUrl: d.avatarUrl ?? null, seasons });
      if (seasons.length > 0) setExpandedSeason(seasons[0].id);
    } catch (e) {
      console.error('fetchClient failed:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProgress() {
    if (!user?.uid) return;
    setProgressLoading(true);
    try {
      // 1. Progress doc
      const progSnap = await getDoc(doc(db, 'users', user.uid, 'progress', id));
      const prog     = progSnap.data();
      const completed: string[] = prog?.completedEpisodes ?? [];
      const clueIds:  string[] = prog?.cluesFound        ?? [];
      setCompletedEpisodes(completed);
      setLastEpisodeId(prog?.lastEpisodeId ?? null);
      setHasInkState(!!prog?.inkStateJson);

      // 2. Clue details from Firestore
      const clueDetails: ClueDetail[] = await Promise.all(
        clueIds.map(async cId => {
          try {
            const snap = await getDoc(doc(db, 'clues', cId));
            const cd = snap.data();
            return {
              id:          cId,
              title:       cd?.title       ?? cId.replace(/_/g, ' '),
              description: cd?.description ?? '',
              type:        cd?.type        ?? '',
              importance:  cd?.importance  ?? '',
            };
          } catch (_) {
            return { id: cId, title: cId.replace(/_/g, ' '), description: '', type: '', importance: '' };
          }
        })
      );
      setClues(clueDetails);

      // 3. NPCs for this client → relationships
      const npcSnap = await getDocs(
        query(collection(db, 'npcs'), where('appearsInClients', 'array-contains', id))
      );
      const npcMeta: Record<string, { name: string; role: string }> = {};
      npcSnap.docs.forEach(d => { npcMeta[d.id] = { name: d.data().name, role: d.data().role }; });
      const clientNpcIds = new Set(npcSnap.docs.map(d => d.id));

      const userSnap  = await getDoc(doc(db, 'users', user.uid));
      const allRels: any[] = userSnap.data()?.relationships ?? [];
      const clientRels: NpcRel[] = allRels
        .filter(r => clientNpcIds.has(r.npcId))
        .map(r => ({
          npcId: r.npcId,
          name:  npcMeta[r.npcId]?.name ?? r.npcId,
          role:  npcMeta[r.npcId]?.role ?? '',
          value: r.value ?? 0,
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));  // most extreme first
      setRelationships(clientRels);
    } catch (e) {
      console.error('fetchProgress failed:', e);
    } finally {
      setProgressLoading(false);
    }
  }

  // ── Derive episode progress ────────────────────────────────────────────────

  function applyProgress(seasons: Season[]): Season[] {
    return seasons.map(season => ({
      ...season,
      episodes: season.episodes.map((ep, idx) => {
        const prevEp    = idx > 0 ? season.episodes[idx - 1] : null;
        const isComplete = completedEpisodes.includes(ep.id);
        const inProgress = hasInkState && lastEpisodeId === ep.id && !isComplete;
        const isLocked   = idx > 0 && prevEp != null && !completedEpisodes.includes(prevEp.id);
        return { ...ep, isComplete, inProgress, isLocked };
      }),
    }));
  }

  // ── Render guards ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}><ActivityIndicator size="large" color={Colors.accent} /></View>
      </SafeAreaView>
    );
  }

  if (!client) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 60 }}>
          Client not found.
        </Text>
      </SafeAreaView>
    );
  }

  const displayedClient = { ...client, seasons: applyProgress(client.seasons) };
  const TABS: { key: InnerTab; label: string }[] = [
    { key: 'episodes',   label: '🗂️  Episodes'   },
    { key: 'case_files', label: '🔍  Case Files' },
    { key: 'gallery',    label: '🖼️  Gallery'    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Clients</Text>
        </TouchableOpacity>
        <View style={styles.clientMeta}>
          <View style={styles.avatarBox}>
            {client.avatarUrl
              ? <Image source={{ uri: client.avatarUrl }} style={styles.avatarImage} />
              : LOCAL_AVATARS[id]
                ? <Image source={LOCAL_AVATARS[id]} style={styles.avatarImage} />
                : <Text style={styles.avatarEmoji}>🕵️</Text>
            }
          </View>
          <View>
            <Text style={styles.clientName}>{client.name}</Text>
            <Text style={styles.tagline}>{client.tagline}</Text>
          </View>
        </View>
      </View>

      {/* Inner tab switcher */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Episodes tab ─────────────────────────────────────────────────── */}
      {activeTab === 'episodes' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {displayedClient.seasons.map(season => (
            <View key={season.id} style={styles.seasonBlock}>
              <TouchableOpacity
                style={styles.seasonHeader}
                onPress={() => setExpandedSeason(expandedSeason === season.id ? null : season.id)}
              >
                <Text style={styles.seasonTitle}>{season.title}</Text>
                <Text style={styles.chevron}>{expandedSeason === season.id ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {expandedSeason === season.id && (
                <View style={styles.episodeList}>
                  {season.episodes.map(ep => (
                    <TouchableOpacity
                      key={ep.id}
                      style={[styles.episodeCard, ep.isLocked && styles.episodeLocked]}
                      activeOpacity={ep.isLocked ? 1 : 0.7}
                      onPress={() => {
                        if (ep.isLocked) return;
                        router.push({
                          pathname: '/(main)/episode',
                          params: { clientId: id, seasonId: season.id, episodeId: ep.id },
                        });
                      }}
                    >
                      {/* Status icon */}
                      <View style={styles.epStatus}>
                        {ep.isComplete  && <View style={[styles.epDot, { backgroundColor: Colors.success }]}><Text style={styles.epDotText}>✓</Text></View>}
                        {ep.inProgress  && <View style={[styles.epDot, { backgroundColor: Colors.accent  }]}><Text style={styles.epDotText}>▶</Text></View>}
                        {!ep.isComplete && !ep.inProgress && !ep.isLocked && <View style={[styles.epDot, { borderWidth: 1, borderColor: Colors.border }]}><Text style={styles.epDotText}>▷</Text></View>}
                        {ep.isLocked    && <Text style={styles.lockIcon}>🔒</Text>}
                      </View>

                      <View style={styles.epInfo}>
                        <Text style={[styles.episodeTitle, ep.isLocked && styles.lockedText]}>
                          {ep.title}
                        </Text>
                        {ep.inProgress  && <Text style={styles.epBadge}>In progress</Text>}
                        {ep.isComplete  && <Text style={[styles.epBadge, { color: Colors.success }]}>Completed</Text>}
                      </View>

                      {!ep.isLocked && <Text style={styles.arrow}>›</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Case Files tab ───────────────────────────────────────────────── */}
      {activeTab === 'case_files' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {progressLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} style={{ marginTop: 40 }} />
          ) : (clues.length === 0 && relationships.length === 0) ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No Evidence Yet</Text>
              <Text style={styles.emptySub}>
                Play an episode to start collecting clues{'\n'}and building suspect profiles.
              </Text>
            </View>
          ) : (
            <>
              {/* Clues */}
              {clues.length > 0 && (
                <View>
                  <Text style={styles.sectionLabel}>Evidence ({clues.length})</Text>
                  {clues.map((clue, i) => (
                    <View key={clue.id} style={styles.clueCard}>
                      <View style={styles.clueNumWrap}>
                        <Text style={styles.clueNum}>{i + 1}</Text>
                      </View>
                      <View style={styles.clueBody}>
                        <View style={styles.clueHeadRow}>
                          <Text style={styles.clueTitle}>{clue.title}</Text>
                          {clue.importance === 'critical' && (
                            <View style={styles.criticalBadge}>
                              <Text style={styles.criticalText}>Critical</Text>
                            </View>
                          )}
                        </View>
                        {clue.description ? (
                          <Text style={styles.clueDesc}>{clue.description}</Text>
                        ) : null}
                        {clue.type ? (
                          <Text style={styles.clueType}>{clue.type.toUpperCase()}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Relationships */}
              {relationships.length > 0 && (
                <View style={{ marginTop: clues.length > 0 ? 16 : 0 }}>
                  <Text style={styles.sectionLabel}>Relationships</Text>
                  {relationships.map(rel => {
                    const { label, color } = relLabel(rel.value);
                    const pct = relBarPct(rel.value);
                    return (
                      <View key={rel.npcId} style={styles.relCard}>
                        <View style={styles.relTop}>
                          <View>
                            <Text style={styles.relName}>{rel.name}</Text>
                            <Text style={styles.relRole}>{rel.role}</Text>
                          </View>
                          <View style={[styles.relBadge, { borderColor: color + '55' }]}>
                            <Text style={[styles.relBadgeText, { color }]}>{label}</Text>
                          </View>
                        </View>
                        <View style={styles.relBarBg}>
                          <View style={[styles.relBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                        </View>
                        <Text style={styles.relVal}>{rel.value > 0 ? '+' : ''}{rel.value}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Gallery tab ──────────────────────────────────────────────────── */}
      {activeTab === 'gallery' && (
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonIcon}>🖼️</Text>
          <Text style={styles.comingSoonTitle}>Gallery Coming Soon</Text>
          <Text style={styles.comingSoonSub}>
            Scene photos, clue images, and story moments{'\n'}will appear here as you progress.
          </Text>
        </View>
      )}

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:     { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn:    { marginBottom: 12 },
  backText:   { fontSize: 15, color: Colors.accent, fontWeight: '600' },
  clientMeta:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarBox:   { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 56, height: 56, borderRadius: 28 },
  avatarEmoji: { fontSize: 32 },
  clientName: { fontSize: 18, fontWeight: '800', color: Colors.textLight },
  tagline:    { fontSize: 13, color: Colors.accent, fontStyle: 'italic', marginTop: 2 },

  tabBar:         { flexDirection: 'row', borderBottomWidth: 1, borderColor: Colors.border, marginHorizontal: 20 },
  tabBtn:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel:       { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  tabLabelActive: { color: Colors.accent },

  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },

  // ── Episodes ────────────────────────────────────────────────────────────────
  seasonBlock:  { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  seasonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  seasonTitle:  { fontSize: 15, fontWeight: '700', color: Colors.textLight, flex: 1 },
  chevron:      { fontSize: 12, color: Colors.textMuted },

  episodeList:  { borderTopWidth: 1, borderColor: Colors.border },
  episodeCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderColor: Colors.border + '66' },
  episodeLocked:{ opacity: 0.45 },

  epStatus:  { width: 28, alignItems: 'center' },
  epDot:     { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  epDotText: { fontSize: 10, color: Colors.textLight, fontWeight: '800' },
  lockIcon:  { fontSize: 16 },

  epInfo:       { flex: 1, gap: 2 },
  episodeTitle: { fontSize: 14, color: Colors.textLight },
  lockedText:   { color: Colors.textMuted },
  epBadge:      { fontSize: 10, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },

  arrow: { fontSize: 24, color: Colors.accent, fontWeight: '300' },

  // ── Case Files ──────────────────────────────────────────────────────────────
  sectionLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },

  clueCard:    { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, flexDirection: 'row', gap: 12, marginBottom: 8 },
  clueNumWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  clueNum:     { fontSize: 11, fontWeight: '800', color: Colors.accent },
  clueBody:    { flex: 1, gap: 6 },
  clueHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  clueTitle:   { fontSize: 14, fontWeight: '700', color: Colors.textLight, flex: 1 },
  criticalBadge:{ backgroundColor: Colors.danger + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  criticalText: { fontSize: 9, color: Colors.danger, fontWeight: '800', letterSpacing: 0.5 },
  clueDesc:    { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  clueType:    { fontSize: 10, color: Colors.accentDim, fontWeight: '700', letterSpacing: 0.5 },

  relCard:     { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10, marginBottom: 8 },
  relTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  relName:     { fontSize: 14, fontWeight: '700', color: Colors.textLight },
  relRole:     { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  relBadge:    { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  relBadgeText:{ fontSize: 11, fontWeight: '700' },
  relBarBg:    { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  relBarFill:  { height: '100%', borderRadius: 2 },
  relVal:      { fontSize: 11, color: Colors.textMuted, textAlign: 'right' },

  // ── Empty / Gallery ─────────────────────────────────────────────────────────
  emptyState:   { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon:    { fontSize: 48 },
  emptyTitle:   { fontSize: 18, fontWeight: '800', color: Colors.textLight },
  emptySub:     { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  comingSoon:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  comingSoonIcon:  { fontSize: 48 },
  comingSoonTitle: { fontSize: 20, fontWeight: '800', color: Colors.textLight },
  comingSoonSub:   { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
