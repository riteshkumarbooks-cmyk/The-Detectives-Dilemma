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
import { Colors } from '@/constants/colors';
import { AuthButton } from '@/components/AuthButton';
import { InputField } from '@/components/InputField';
import { registerWithEmail } from '@/services/auth';

interface FormErrors {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export default function RegisterScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): boolean {
    const newErrors: FormErrors = {};

    if (!displayName.trim()) {
      newErrors.displayName = 'Name is required';
    } else if (displayName.trim().length < 2) {
      newErrors.displayName = 'Name must be at least 2 characters';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function clearError(field: keyof FormErrors) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleRegister() {
    if (!validate()) return;
    setLoading(true);
    try {
      await registerWithEmail(email.trim(), password, displayName.trim());
      // Root layout will auto-navigate to (main) on auth state change
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      Alert.alert('Registration Failed', friendlyFirebaseError(msg));
    } finally {
      setLoading(false);
    }
  }

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
          <Text style={styles.logoEmoji}>🔍</Text>
          <Text style={styles.title}>Join the Force</Text>
          <Text style={styles.subtitle}>Create your detective profile</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <InputField
            label="Detective Name"
            placeholder="e.g. Sam Spade"
            value={displayName}
            onChangeText={(t) => { setDisplayName(t); clearError('displayName'); }}
            error={errors.displayName}
            autoCapitalize="words"
          />
          <InputField
            label="Email"
            placeholder="detective@example.com"
            keyboardType="email-address"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError('email'); }}
            error={errors.email}
          />
          <InputField
            label="Password"
            placeholder="Min. 8 characters"
            secureTextEntry
            showPasswordToggle
            value={password}
            onChangeText={(t) => { setPassword(t); clearError('password'); }}
            error={errors.password}
          />
          <InputField
            label="Confirm Password"
            placeholder="Re-enter password"
            secureTextEntry
            showPasswordToggle
            value={confirmPassword}
            onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
            error={errors.confirmPassword}
          />

          {/* Password hint */}
          {!errors.password && password.length > 0 && password.length < 8 && (
            <Text style={styles.hint}>
              {8 - password.length} more characters needed
            </Text>
          )}

          <AuthButton
            label="Create Account"
            variant="primary"
            onPress={handleRegister}
            loading={loading}
            style={styles.registerButton}
          />
        </View>

        {/* Terms note */}
        <Text style={styles.terms}>
          By creating an account you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>.
        </Text>

        {/* Back to login */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already a detective? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.linkText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyFirebaseError(message: string): string {
  if (message.includes('email-already-in-use')) return 'This email is already registered.';
  if (message.includes('weak-password')) return 'Password is too weak.';
  if (message.includes('invalid-email')) return 'Invalid email address.';
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
    marginBottom: 36,
  },
  logoEmoji: {
    fontSize: 52,
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.textLight,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.accent,
    marginTop: 8,
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  form: {
    gap: 4,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginLeft: 4,
  },
  registerButton: {
    marginTop: 12,
  },
  terms: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
  termsLink: {
    color: Colors.accent,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
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
