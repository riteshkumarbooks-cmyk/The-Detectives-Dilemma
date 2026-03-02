import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';

export interface Client {
  id:              string;
  name:            string;
  tagline:         string;
  description:     string;
  isLocked:        boolean;
  unlockCondition: string;
  avatar:          string; // emoji placeholder until real art
  activeSeason:    number;
  activeEpisode:   number;
}

const CLIENTS: Client[] = [
  {
    id:              'lady-ashworth',
    name:            'Lady Eleanor Ashworth',
    tagline:         'The Missing Heirloom',
    description:     'A wealthy widow whose prized jewel has vanished under mysterious circumstances. The servants have secrets, and the family has more.',
    isLocked:        false,
    unlockCondition: '',
    avatar:          '👩‍🦳',
    activeSeason:    1,
    activeEpisode:   1,
  },
  {
    id:              'prof-morley',
    name:            'Professor Henry Morley',
    tagline:         'The Academic\'s Secret',
    description:     'A distinguished professor who suspects a colleague of sabotaging his life\'s research. The truth may be darker than academic rivalry.',
    isLocked:        false,
    unlockCondition: '',
    avatar:          '👨‍🏫',
    activeSeason:    1,
    activeEpisode:   1,
  },
  {
    id:              'locked-client',
    name:            'Unknown Client',
    tagline:         '???',
    description:     'This client will reveal themselves once you crack your first case.',
    isLocked:        true,
    unlockCondition: 'Complete Season 1 of any case',
    avatar:          '🔒',
    activeSeason:    0,
    activeEpisode:   0,
  },
];

export default function ClientsScreen() {
  const router = useRouter();

  function handlePress(client: Client) {
    if (client.isLocked) return;
    router.push({ pathname: '/(main)/client/[id]', params: { id: client.id } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Clients</Text>
        <Text style={styles.subtitle}>Choose a case to investigate</Text>
      </View>

      <FlatList
        data={CLIENTS}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.isLocked && styles.cardLocked]}
            onPress={() => handlePress(item)}
            activeOpacity={item.isLocked ? 1 : 0.75}
          >
            {/* Avatar */}
            <View style={[styles.avatarBox, item.isLocked && styles.avatarBoxLocked]}>
              <Text style={styles.avatarEmoji}>{item.avatar}</Text>
            </View>

            {/* Info */}
            <View style={styles.info}>
              <Text style={[styles.clientName, item.isLocked && styles.lockedText]}>
                {item.name}
              </Text>
              <Text style={styles.tagline}>{item.tagline}</Text>
              {!item.isLocked && (
                <Text style={styles.progress}>
                  Season {item.activeSeason} · Episode {item.activeEpisode}
                </Text>
              )}
              {item.isLocked && (
                <Text style={styles.unlockHint}>{item.unlockCondition}</Text>
              )}
            </View>

            {/* Arrow */}
            {!item.isLocked && (
              <Text style={styles.arrow}>›</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  title:   { fontSize: 28, fontWeight: '800', color: Colors.textLight },
  subtitle:{ fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  list:    { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },

  card: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  Colors.surface,
    borderRadius:     16,
    borderWidth:      1,
    borderColor:      Colors.border,
    padding:          16,
    gap:              14,
  },
  cardLocked: {
    opacity:          0.5,
  },

  avatarBox: {
    width:            60,
    height:           60,
    borderRadius:     30,
    backgroundColor:  Colors.accent + '22',
    borderWidth:      1,
    borderColor:      Colors.accent,
    alignItems:       'center',
    justifyContent:   'center',
  },
  avatarBoxLocked: {
    borderColor:      Colors.border,
    backgroundColor:  Colors.surfaceElevated,
  },
  avatarEmoji:  { fontSize: 28 },

  info:         { flex: 1, gap: 4 },
  clientName:   { fontSize: 16, fontWeight: '700', color: Colors.textLight },
  lockedText:   { color: Colors.textMuted },
  tagline:      { fontSize: 13, color: Colors.accent, fontStyle: 'italic' },
  progress:     { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  unlockHint:   { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },

  arrow:        { fontSize: 24, color: Colors.accent, fontWeight: '300' },
});
