import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
const READING_CONTEXT_KEY = 'mp.reading-context';

export interface ReadingContext {
  tagIds: string[];
  note: string;
  savedAt: number;
}

export async function saveReadingContext(context: ReadingContext): Promise<void> {
  await AsyncStorage.setItem(READING_CONTEXT_KEY, JSON.stringify(context));
}

export async function loadReadingContext(): Promise<ReadingContext | null> {
  const raw = await AsyncStorage.getItem(READING_CONTEXT_KEY);
  if (!raw) return null;
  try {
    const context = JSON.parse(raw) as ReadingContext;
    if (!Array.isArray(context.tagIds) || typeof context.note !== 'string' || typeof context.savedAt !== 'number') {
      return null;
    }
    if (Date.now() - context.savedAt > 5 * 60_000) {
      await AsyncStorage.removeItem(READING_CONTEXT_KEY);
      return null;
    }
    return context;
  } catch {
    return null;
  }
}

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
