import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Cache the auth session tokens on first read so we can recover them
// if Supabase's internal initialization clears them (e.g., refresh fails
// because the network isn't ready on cold start).
let _cachedAuthTokens: { access_token: string; refresh_token: string } | null = null;

// SecureStore adapter for Supabase auth
const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value && key.endsWith('-auth-token')) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.access_token && parsed.refresh_token) {
            _cachedAuthTokens = {
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            };
          }
        } catch {
          // ignore parse errors
        }
      }
      return value;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Silently fail on web
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
      if (key.endsWith('-auth-token')) {
        _cachedAuthTokens = null;
      }
    } catch {
      // Silently fail on web
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function getCachedAuthTokens() {
  return _cachedAuthTokens;
}

export function clearCachedAuthTokens() {
  _cachedAuthTokens = null;
}

const LAST_PAIRING_CODE_KEY = 'clautunnel-last-pairing-code';

export async function getLastRedeemedCode(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LAST_PAIRING_CODE_KEY);
  } catch {
    return null;
  }
}

export async function setLastRedeemedCode(code: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(LAST_PAIRING_CODE_KEY, code);
  } catch {
    // ignore
  }
}

export async function clearLastRedeemedCode(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LAST_PAIRING_CODE_KEY);
  } catch {
    // ignore
  }
}

// Export for testing
export { SecureStoreAdapter };
