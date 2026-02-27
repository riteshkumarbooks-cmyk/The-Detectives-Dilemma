import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  OAuthProvider,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { auth, db } from '@/config/firebase';

// Required for expo-auth-session to handle redirect back to app
WebBrowser.maybeCompleteAuthSession();

// ─── Firestore Profile ────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  authProvider: 'google' | 'apple' | 'email';
  createdAt: unknown;
  lastActiveAt: unknown;
}

export async function createUserProfile(
  user: User,
  authProvider: UserProfile['authProvider'],
  displayName?: string
): Promise<void> {
  const profileRef = doc(db, 'users', user.uid);
  await setDoc(
    profileRef,
    {
      uid: user.uid,
      displayName: displayName ?? user.displayName ?? 'Detective',
      email: user.email ?? '',
      authProvider,
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    },
    { merge: true } // merge so re-login doesn't overwrite existing data
  );
}

// ─── Email / Password ─────────────────────────────────────────────────────────

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  await createUserProfile(credential.user, 'email', displayName);
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  await createUserProfile(credential.user, 'email');
  return credential.user;
}

// ─── Google Sign-In ──────────────────────────────────────────────────────────
// Call useGoogleAuth() hook inside a React component to get promptAsync
// Then call signInWithGoogleToken(idToken) with the result

export function buildGoogleAuthRequest() {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ...(iosClientId ? { iosClientId } : {}),
    ...(androidClientId ? { androidClientId } : {}),
  });
}

export async function signInWithGoogleToken(idToken: string): Promise<User> {
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, googleCredential);
  await createUserProfile(result.user, 'google');
  return result.user;
}

// ─── Apple Sign-In ────────────────────────────────────────────────────────────

export async function signInWithApple(): Promise<User> {
  // Generate a cryptographically secure random nonce
  const rawNonce = Array.from(
    await Crypto.getRandomBytesAsync(32),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');

  // Apple requires the SHA-256 hash of the nonce; Firebase needs the raw nonce
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce, // Apple verifies this hash
  });

  const { identityToken, fullName } = appleCredential;
  if (!identityToken) throw new Error('Apple Sign-In failed: no identity token');

  const appleProvider = new OAuthProvider('apple.com');
  const firebaseCredential = appleProvider.credential({
    idToken: identityToken,
    rawNonce, // Firebase uses the original raw nonce to verify
  });

  const result = await signInWithCredential(auth, firebaseCredential);

  // Apple only provides name on first sign-in
  const displayName =
    fullName?.givenName && fullName?.familyName
      ? `${fullName.givenName} ${fullName.familyName}`
      : result.user.displayName ?? 'Detective';

  await createUserProfile(result.user, 'apple', displayName);
  return result.user;
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
