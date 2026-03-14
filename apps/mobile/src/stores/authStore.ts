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
  initialize: () => Promise<void>;
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

  initialize: async () => {
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

      const isPaired = !!session;

      set({
        session,
        user: session?.user ?? null,
        isPaired,
        isLoading: false,
      });

      // Listen for auth changes (token refresh, etc.)
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          isPaired: !!session,
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

      // Call the Edge Function to redeem the pairing code
      const { data, error: fnError } = await supabase.functions.invoke(
        'redeem-mobile-pairing',
        { body: { code } }
      );

      if (fnError) throw fnError;

      if (!data?.hashed_token) {
        throw new Error(data?.error || 'Failed to redeem pairing code');
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

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          isPaired: !!session,
        });
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
