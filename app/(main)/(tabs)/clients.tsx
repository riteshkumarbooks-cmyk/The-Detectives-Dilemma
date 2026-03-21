import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Colors } from '@/constants/colors';

export interface Client {
  id:              string;
  name:            string;
  tagline:         string;
  description:     string;
  isLocked:        boolean;
  unlockCondition: string;
  avatarUrl:       string | null;   // S3 URL — null until image is uploaded
  order:           number;
}

// Locked placeholder appended after live Firestore clients
const LOCKED_PLACEHOLDER: Client = {
  id:              'locked-client',
  name:            'Unknown Client',
  tagline:         '???',
  description:     'This client will reveal themselves once you crack your first case.',
  isLocked:        true,
  unlockCondition: 'Complete Season 1 of any case',
  avatarUrl:       null,
  order:           999,
};

function releaseStatusToLocked(status: string): boolean {
  return status === 'coming_soon';
}

// Local bundled avatars — used when Firestore avatarUrl is null.
// Drop the image in assets/clients/ and add an entry here.
// When Firebase Storage is ready, set avatarUrl on the Firestore doc and this map is bypassed.
const LOCAL_AVATARS: Record<string, ReturnType<typeof require>> = {
  'duchess-margaux': require('../../../assets/clients/duchess-margaux/margaux-avatar.png'),
};

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClients() {
      try {
        const q    = query(collection(db, 'clients'), orderBy('order'));
        const snap = await getDocs(q);
        const live: Client[] = snap.docs.map(doc => {
          const d = doc.data();
          return {
            id:              doc.id,
            name:            d.name,
            tagline:         d.tagline,
            description:     d.description,
            isLocked:        releaseStatusToLocked(d.releaseStatus),
            unlockCondition: '',
            avatarUrl:       d.avatarUrl ?? null,
            order:           d.order,
          };
        });
        setClients([...live, LOCKED_PLACEHOLDER]);
      } catch (e) {
        console.error('Failed to load clients:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, []);

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

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={clients}
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
                {item.isLocked
                  ? <Text style={styles.avatarEmoji}>🔒</Text>
                  : item.avatarUrl
                    ? <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                    : LOCAL_AVATARS[item.id]
                      ? <Image source={LOCAL_AVATARS[item.id]} style={styles.avatarImage} />
                      : <Text style={styles.avatarEmoji}>🕵️</Text>
                }
              </View>

              {/* Info */}
              <View style={styles.info}>
                <Text style={[styles.clientName, item.isLocked && styles.lockedText]}>
                  {item.name}
                </Text>
                <Text style={styles.tagline}>{item.tagline}</Text>
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  header:  { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  title:   { fontSize: 28, fontWeight: '800', color: Colors.textLight },
  subtitle:{ fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  loader:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:    { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },

  card: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         16,
    gap:             14,
  },
  cardLocked: { opacity: 0.5 },

  avatarBox: {
    width:           60,
    height:          60,
    borderRadius:    30,
    backgroundColor: Colors.accent + '22',
    borderWidth:     1,
    borderColor:     Colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarBoxLocked: {
    borderColor:     Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
  avatarEmoji: { fontSize: 28 },

  info:       { flex: 1, gap: 4 },
  clientName: { fontSize: 16, fontWeight: '700', color: Colors.textLight },
  lockedText: { color: Colors.textMuted },
  tagline:    { fontSize: 13, color: Colors.accent, fontStyle: 'italic' },
  unlockHint: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },

  arrow: { fontSize: 24, color: Colors.accent, fontWeight: '300' },
});
