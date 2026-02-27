import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { AuthButton } from './AuthButton';
import { signInWithGoogleToken } from '@/services/auth';

WebBrowser.maybeCompleteAuthSession();

// Expo Go on mobile: OAuth redirect can't complete (exp:// scheme not registerable with Google).
// We still pass all client IDs to satisfy expo-auth-session's validation, but intercept
// the press to show a helpful message instead of starting a flow that will fail.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

interface Props {
  onLoadingChange: (loading: boolean) => void;
  loading: boolean;
}

export function GoogleSignInButton({ onLoadingChange, loading }: Props) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      onLoadingChange(true);
      signInWithGoogleToken(id_token)
        .catch((err: Error) => Alert.alert('Google Sign-In Failed', err.message))
        .finally(() => onLoadingChange(false));
    } else if (response?.type === 'error') {
      Alert.alert('Google Sign-In Error', response.error?.message ?? 'Unknown error');
    }
  }, [response]);

  function handlePress() {
    if (isExpoGo && Platform.OS !== 'web') {
      Alert.alert(
        'Google Sign-In',
        'Google Sign-In is not supported in Expo Go on mobile.\n\nYou can test it now by running "expo start --web" in a browser, or it will work fully in the Phase 5 production build.',
        [{ text: 'Got it' }]
      );
      return;
    }
    onLoadingChange(true);
    promptAsync().finally(() => onLoadingChange(false));
  }

  return (
    <AuthButton
      label="Continue with Google"
      variant="google"
      onPress={handlePress}
      loading={loading}
      disabled={!request}
    />
  );
}
