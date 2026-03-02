import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '@/constants/colors';

export default function GalleryScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.icon}>🖼️</Text>
        <Text style={styles.title}>Gallery</Text>
        <Text style={styles.sub}>
          Scene photos, clue images, and story moments{'\n'}
          will appear here as you play through episodes.
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Coming in Phase 5</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  icon:   { fontSize: 56 },
  title:  { fontSize: 24, fontWeight: '800', color: Colors.textLight },
  sub:    { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  badge:  { marginTop: 8, backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  badgeText: { fontSize: 12, fontWeight: '700', color: Colors.accent, letterSpacing: 0.5 },
});
