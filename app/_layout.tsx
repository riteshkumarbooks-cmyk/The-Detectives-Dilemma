import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/hooks/useAuth';

export default function RootLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    // app/index.tsx shows splash.png for 1500 ms, then navigate

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';
    const navigate = () => {
      if (!user && !inAuthGroup) {
        // Not logged in → go to login
        router.replace('/(auth)/login');
      } else if (user && !inMainGroup) {
        // Logged in but not yet on main (covers splash + auth screens) → go to main
        router.replace('/(main)');
      }
    };

    const timer = setTimeout(navigate, 1500);
    return () => clearTimeout(timer);
  }, [user, loading, segments]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
      </Stack>
    </>
  );
}
