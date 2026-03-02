import { Tabs } from 'expo-router';
import { Colors } from '@/constants/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:          false,
        tabBarStyle: {
          backgroundColor:    Colors.surface,
          borderTopColor:     Colors.border,
          borderTopWidth:     1,
          height:             60,
          paddingBottom:      8,
        },
        tabBarActiveTintColor:   Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize:     10,
          fontWeight:   '600',
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} /> }}
      />
      <Tabs.Screen
        name="clients"
        options={{ title: 'Clients', tabBarIcon: ({ color }) => <TabIcon emoji="👥" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon emoji="🕵️" color={color} /> }}
      />
      <Tabs.Screen
        name="gallery"
        options={{ title: 'Gallery', tabBarIcon: ({ color }) => <TabIcon emoji="🖼️" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, opacity: color === Colors.accent ? 1 : 0.5 }}>{emoji}</Text>;
}
