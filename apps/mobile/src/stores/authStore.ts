import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';
import {
  isTestMode,
  MOCK_USER,
  MOCK_SESSION,
} from '../utils/testMode';

interface AuthState {
  user: User | null;
  session: Session | null;
  isPaired: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: (initialUrl?: string | null) => Promise<void>;
  redeemPairingCode: (code: string) => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

const _testMode = isTestMode();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isPaired: false,
  isLoading: true,
  error: null,

  initialize: async (initialUrl?: string | null) => {
    if (_testMode) {
      set({ isLoading: false, error: null, user: null, session: null, isPaired: false });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      // Check for existing session in SecureStore (persisted from a previous pairing)
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      // If app was opened with a pairing code and already has a session,
      // sign out the old session so re-pairing can proceed.
      // This must happen before isLoading is set to false to prevent
      // routing from redirecting to tabs with the stale session.
      if (initialUrl?.includes('code=') && session) {
        await supabase.auth.signOut({ scope: 'local' });
        set({ session: null, user: null, isPaired: false, isLoading: false });
      } else {
        set({
          session,
          user: session?.user ?? null,
          isPaired: !!session,
          isLoading: false,
        });
      }

      // Listen for auth changes (token refresh, re-pairing, etc.)
      // Registered once regardless of path above
      supabase.auth.onAuthStateChange((_event, newSession) => {
        set({
          session: newSession,
          user: newSession?.user ?? null,
          isPaired: !!newSession,
        });
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isLoading: false,
      });
    }
  },

  redeemPairingCode: async (code: string) => {
    if (_testMode) {
      set({
        user: MOCK_USER as User,
        session: MOCK_SESSION as unknown as Session,
        isPaired: true,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      // Sign out any existing session first (re-pairing with a different account)
      if (get().isPaired) {
        await supabase.auth.signOut({ scope: 'local' });
        set({ session: null, user: null, isPaired: false });
      }

      // Call the Edge Function to redeem the pairing code
      // Using fetch() directly instead of supabase.functions.invoke() to get
      // the actual error message from the response body on non-2xx responses
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/redeem-mobile-pairing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey!,
          },
          body: JSON.stringify({ code }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Pairing failed (${response.status})`);
      }

      if (!data?.hashed_token) {
        throw new Error('Failed to redeem pairing code');
      }

      // Verify the OTP to get a full Supabase session
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.hashed_token,
        type: 'email',
      });

      if (verifyError) throw verifyError;

      if (!verifyData.session) {
        throw new Error('No session returned from verification');
      }

      set({
        session: verifyData.session,
        user: verifyData.user,
        isPaired: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to pair device',
        isLoading: false,
      });
    }
  },

  disconnect: async () => {
    if (_testMode) {
      set({
        session: null,
        user: null,
        isPaired: false,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase.auth.signOut({ scope: 'local' });

      if (error) throw error;

      set({
        session: null,
        user: null,
        isPaired: false,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to disconnect',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
