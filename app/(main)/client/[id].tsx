import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, getDoc, doc, orderBy, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Colors } from '@/constants/colors';

interface Episode {
  id:    string;
  title: string;
  order: number;
  isLocked: boolean;
}

interface Season {
  id:       string;
  title:    string;
  order:    number;
  episodes: Episode[];
}

interface ClientDetail {
  name:    string;
  tagline: string;
  avatar:  string;
  seasons: Season[];
}

function avatarForClient(id: string): string {
  const map: Record<string, string> = { 'duchess-margaux': '👑' };
  return map[id] ?? '🕵️';
}

type InnerTab = 'episodes' | 'gallery';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const [client,         setClient]         = useState<ClientDetail | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [activeTab,      setActiveTab]      = useState<InnerTab>('episodes');
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function fetchClient() {
      try {
        // 1. Fetch client doc
        const clientSnap = await getDoc(doc(db, 'clients', id));
        if (!clientSnap.exists()) { setLoading(false); return; }
        const d = clientSnap.data();

        // 2. Fetch seasons
        const seasonsSnap = await getDocs(
          query(collection(db, 'clients', id, 'seasons'), orderBy('order'))
        );

        const seasons: Season[] = await Promise.all(
          seasonsSnap.docs.map(async seasonDoc => {
            const sd = seasonDoc.data();

            // 3. Fetch episodes for each season
            const episodesSnap = await getDocs(
              query(
                collection(db, 'clients', id, 'seasons', seasonDoc.id, 'episodes'),
                orderBy('order')
              )
            );

            const episodes: Episode[] = episodesSnap.docs.map((epDoc, idx) => {
              const ed = epDoc.data();
              return {
                id:       epDoc.id,
                title:    `Ep ${ed.order} · ${ed.title}`,
                order:    ed.order,
                isLocked: idx > 0,   // first episode free; Phase 3 adds entitlement check
              };
            });

            return {
              id:       seasonDoc.id,
              title:    sd.title,
              order:    sd.order,
              episodes,
            };
          })
        );

        setClient({
          name:    d.name,
          tagline: d.tagline,
          avatar:  avatarForClient(id),
          seasons,
        });

        // Auto-expand first season
        if (seasons.length > 0) setExpandedSeason(seasons[0].id);
      } catch (e) {
        console.error('Failed to load client detail:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchClient();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Clients</Text>
        </TouchableOpacity>
        <View style={styles.clientMeta}>
          <Text style={styles.avatarEmoji}>{client.avatar}</Text>
          <View>
            <Text style={styles.clientName}>{client.name}</Text>
            <Text style={styles.tagline}>{client.tagline}</Text>
          </View>
        </View>
      </View>

      {/* Inner tab switcher */}
      <View style={styles.tabBar}>
        {(['episodes', 'gallery'] as InnerTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab === 'episodes' ? '🗂️  Episodes' : '🖼️  Gallery'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'episodes' ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {client.seasons.map(season => (
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
                      <Text style={styles.episodeLockIcon}>{ep.isLocked ? '🔒' : '▶️'}</Text>
                      <Text style={[styles.episodeTitle, ep.isLocked && styles.lockedText]}>
                        {ep.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      ) : (
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

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:     { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn:    { marginBottom: 12 },
  backText:   { fontSize: 15, color: Colors.accent, fontWeight: '600' },
  clientMeta: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarEmoji:{ fontSize: 40 },
  clientName: { fontSize: 18, fontWeight: '800', color: Colors.textLight },
  tagline:    { fontSize: 13, color: Colors.accent, fontStyle: 'italic', marginTop: 2 },

  tabBar:         { flexDirection: 'row', borderBottomWidth: 1, borderColor: Colors.border, marginHorizontal: 20 },
  tabBtn:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive:   { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel:       { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  tabLabelActive: { color: Colors.accent },

  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },

  seasonBlock:  { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  seasonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  seasonTitle:  { fontSize: 15, fontWeight: '700', color: Colors.textLight, flex: 1 },
  chevron:      { fontSize: 12, color: Colors.textMuted },

  episodeList:     { borderTopWidth: 1, borderColor: Colors.border },
  episodeCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderColor: Colors.border + '66' },
  episodeLocked:   { opacity: 0.45 },
  episodeLockIcon: { fontSize: 16 },
  episodeTitle:    { fontSize: 14, color: Colors.textLight, flex: 1 },
  lockedText:      { color: Colors.textMuted },

  comingSoon:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  comingSoonIcon:  { fontSize: 48 },
  comingSoonTitle: { fontSize: 20, fontWeight: '800', color: Colors.textLight },
  comingSoonSub:   { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
