import { create } from 'zustand';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/supabase';
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
      } else if (session) {
        // Session exists in SecureStore — check if the access token is expired.
        // getSession() only reads from local storage and does not validate with
        // the server, so after a long period (e.g. app rebuild hours later) the
        // stored tokens may be stale. Force a refresh via setSession() which
        // sends the refresh_token to Supabase and returns a new token pair.
        const isExpired =
          typeof session.expires_at === 'number' &&
          session.expires_at < Math.floor(Date.now() / 1000);

        if (isExpired) {
          const { data: refreshed, error: refreshError } =
            await supabase.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            });

          if (refreshError || !refreshed.session) {
            // Refresh failed — tokens are fully expired. Clean up and show
            // the pairing screen so the user can re-pair.
            await supabase.auth.signOut({ scope: 'local' });
            set({ session: null, user: null, isPaired: false, isLoading: false });
          } else {
            set({
              session: refreshed.session,
              user: refreshed.session.user ?? null,
              isPaired: true,
              isLoading: false,
            });
          }
        } else {
          set({
            session,
            user: session.user ?? null,
            isPaired: true,
            isLoading: false,
          });
        }
      } else {
        set({
          session: null,
          user: null,
          isPaired: false,
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
      // the actual error message from the response body on non-2xx responses.
      // Retry on network errors — when the app transitions from background to
      // foreground (e.g. scanning a QR from camera), the network stack may not
      // be ready immediately.
      const url = `${SUPABASE_URL}/functions/v1/redeem-mobile-pairing`;
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ code }),
      };

      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (networkError) {
        // Retry once after a short delay for background→foreground transitions
        await new Promise((r) => setTimeout(r, 1500));
        response = await fetch(url, fetchOptions);
      }

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
