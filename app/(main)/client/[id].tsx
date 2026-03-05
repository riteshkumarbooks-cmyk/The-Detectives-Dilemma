import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';

// ── Season / Episode data (placeholder until Firestore episodes in Phase 3) ──
const CLIENT_DATA: Record<string, {
  name: string; tagline: string; avatar: string;
  seasons: { id: string; title: string; episodes: { id: string; title: string; isLocked: boolean }[] }[]
}> = {
  'duchess-margaux': {
    name:    'Duchess Margaux de Valois',
    tagline: "The Crown's Deception",
    avatar:  '👑',
    seasons: [
      {
        id: 'season-1', title: 'Season 1 · Shadows of the Throne',
        episodes: [
          { id: 'ep-1', title: 'Ep 1 · The First Audience',   isLocked: false },
          { id: 'ep-2', title: 'Ep 2 · Hidden Motives',        isLocked: true  },
          { id: 'ep-3', title: 'Ep 3 · The Price of Loyalty',  isLocked: true  },
        ],
      },
    ],
  },
};

type InnerTab = 'episodes' | 'gallery';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const client  = CLIENT_DATA[id ?? ''];
  const [activeTab,     setActiveTab]     = useState<InnerTab>('episodes');
  const [expandedSeason, setExpandedSeason] = useState<string | null>('s1');

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
  safe:       { flex: 1, backgroundColor: Colors.background },

  header:     { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn:    { marginBottom: 12 },
  backText:   { fontSize: 15, color: Colors.accent, fontWeight: '600' },
  clientMeta: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarEmoji:{ fontSize: 40 },
  clientName: { fontSize: 18, fontWeight: '800', color: Colors.textLight },
  tagline:    { fontSize: 13, color: Colors.accent, fontStyle: 'italic', marginTop: 2 },

  tabBar:       { flexDirection: 'row', borderBottomWidth: 1, borderColor: Colors.border, marginHorizontal: 20 },
  tabBtn:       { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel:     { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  tabLabelActive: { color: Colors.accent },

  content:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 12 },

  seasonBlock:  { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  seasonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  seasonTitle:  { fontSize: 15, fontWeight: '700', color: Colors.textLight, flex: 1 },
  chevron:      { fontSize: 12, color: Colors.textMuted },

  episodeList:  { borderTopWidth: 1, borderColor: Colors.border },
  episodeCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderColor: Colors.border + '66' },
  episodeLocked:{ opacity: 0.45 },
  episodeLockIcon: { fontSize: 16 },
  episodeTitle: { fontSize: 14, color: Colors.textLight, flex: 1 },
  lockedText:   { color: Colors.textMuted },

  comingSoon:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  comingSoonIcon:   { fontSize: 48 },
  comingSoonTitle:  { fontSize: 20, fontWeight: '800', color: Colors.textLight },
  comingSoonSub:    { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
