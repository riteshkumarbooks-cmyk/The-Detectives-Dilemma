import { Stack } from 'expo-router';

export default function MainLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0D0D0D' } }}>
      <Stack.Screen name="index"        />
      <Stack.Screen name="(tabs)"       />
      <Stack.Screen name="client/[id]"  options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="episode"        options={{ animation: 'fade' }} />
      <Stack.Screen name="inkdemo"        options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="minigame"       options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
