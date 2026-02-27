import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Colors } from '@/constants/colors';
import { AuthButton } from '@/components/AuthButton';
import { InputField } from '@/components/InputField';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { signInWithEmail, signInWithApple } from '@/services/auth';

// In Expo Go, expo-auth-session's Google hook throws if iosClientId is undefined.
// We never render GoogleSignInButton in Expo Go — instead we show a plain button
// with an explanatory alert. GoogleSignInButton is only mounted in real builds
// where the bundle ID matches and native client IDs work correctly.
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const showGoogleSignIn = !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Invalid email';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleEmailLogin() {
    if (!validate()) return;
    setEmailLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      Alert.alert('Sign-In Failed', friendlyFirebaseError(msg));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleAppleLogin() {
    try {
      await signInWithApple();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        const msg = err instanceof Error ? err.message : 'Apple sign-in failed';
        Alert.alert('Apple Sign-In Failed', msg);
      }
    }
  }

  const hasSocialLogin = showGoogleSignIn || Platform.OS === 'ios';

  // In Expo Go, GoogleSignInButton cannot be mounted (its hook throws without a valid
  // native bundle ID). Render a plain button with an alert instead.
  const googleButton = isExpoGo && Platform.OS !== 'web' ? (
    <AuthButton
      label="Continue with Google"
      variant="google"
      onPress={() => Alert.alert(
        'Google Sign-In',
        'Google Sign-In is not available in Expo Go.\n\nIt will work fully in the Phase 5 production build. Use email/password for now.',
        [{ text: 'Got it' }]
      )}
    />
  ) : (
    <GoogleSignInButton
      loading={googleLoading}
      onLoadingChange={setGoogleLoading}
    />
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoEmoji}>🐱</Text>
          <Text style={styles.title}>Welcome Back,{'\n'}Detective</Text>
          <Text style={styles.subtitle}>Your cases await.</Text>
        </View>

        {/* Social Login — only rendered when platform credentials are configured */}
        {hasSocialLogin && (
          <View style={styles.socialSection}>
            {showGoogleSignIn && googleButton}

            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleAppleLogin}
              />
            )}
          </View>
        )}

        {/* Divider — only shown when there are social buttons above */}
        {hasSocialLogin && (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        {/* Email/Password */}
        <View style={styles.formSection}>
          <InputField
            label="Email"
            placeholder="detective@example.com"
            keyboardType="email-address"
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: undefined })); }}
            error={errors.email}
          />
          <InputField
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            showPasswordToggle
            value={password}
            onChangeText={(t) => { setPassword(t); setErrors((e) => ({ ...e, password: undefined })); }}
            error={errors.password}
          />

          <AuthButton
            label="Sign In"
            variant="primary"
            onPress={handleEmailLogin}
            loading={emailLoading}
            style={styles.signInButton}
          />
        </View>

        {/* Register link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>New detective? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.linkText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyFirebaseError(message: string): string {
  if (message.includes('user-not-found')) return 'No account found with this email.';
  if (message.includes('wrong-password')) return 'Incorrect password.';
  if (message.includes('invalid-credential')) return 'Invalid email or password.';
  if (message.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  if (message.includes('network-request-failed')) return 'Network error. Check your connection.';
  return message;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.accent,
    marginTop: 8,
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  socialSection: {
    gap: 4,
    marginBottom: 8,
  },
  appleButton: {
    height: 52,
    marginVertical: 6,
    borderRadius: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  formSection: {
    gap: 4,
  },
  signInButton: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  linkText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
