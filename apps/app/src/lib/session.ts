import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the session token lives.
 *
 * On the phone: the iOS keychain, via SecureStore. On the web build SecureStore
 * does not exist, and the API also sets an httpOnly cookie there - which JavaScript
 * cannot read, so it is the safer credential anyway. localStorage is used purely to
 * remember that we are signed in across a reload.
 */
const KEY = 'mp.session';

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(KEY, token);
    } catch {
      // Private browsing, or storage disabled. The cookie still carries the session.
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* nothing to do */
    }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
