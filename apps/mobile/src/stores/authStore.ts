import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';
import {
  isTestMode,
  MOCK_TEST_CREDENTIALS,
  MOCK_USER,
  MOCK_SESSION,
} from '../utils/testMode';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  claimBootstrapCode: (code: string) => Promise<boolean>;
  signInWithToken: (refreshToken: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const _testMode = isTestMode();

function buildMockAuthState(email = MOCK_USER.email) {
  return {
    user: {
      ...MOCK_USER,
      email,
    } as User,
    session: {
      ...MOCK_SESSION,
      user: {
        ...MOCK_USER,
        email,
      },
    } as Session,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return fallback;
}

let _authListenerRegistered = false;

function listenForAuthChanges(set: (state: Partial<AuthState>) => void) {
  if (_authListenerRegistered) return;
  _authListenerRegistered = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    set({
      session,
      user: session?.user ?? null,
    });
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    if (_testMode) {
      set({ isLoading: false, error: null, user: null, session: null });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      set({
        session,
        user: session?.user ?? null,
        isLoading: false,
      });

      listenForAuthChanges(set);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isLoading: false,
      });
    }
  },

  claimBootstrapCode: async (code: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.functions.invoke('mobile-auth-bootstrap', {
        body: { action: 'claim', code },
      });

      if (error) throw error;

      const refreshToken =
        data && typeof data.refreshToken === 'string' ? data.refreshToken : '';

      if (!refreshToken) {
        throw new Error('Bootstrap response missing refresh token');
      }

      return await get().signInWithToken(refreshToken);
    } catch (error) {
      set({
        error: getErrorMessage(error, 'Failed to claim bootstrap code'),
        isLoading: false,
      });
      return false;
    }
  },

  signInWithToken: async (refreshToken: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) throw error;

      set({
        session: data.session,
        user: data.session?.user ?? null,
        isLoading: false,
      });

      listenForAuthChanges(set);

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to authenticate',
        isLoading: false,
      });
      return false;
    }
  },

  signIn: async (email: string, password: string) => {
    if (_testMode) {
      set({ isLoading: true, error: null });

      if (
        email.trim().toLowerCase() !== MOCK_TEST_CREDENTIALS.email ||
        password !== MOCK_TEST_CREDENTIALS.password
      ) {
        set({
          error: 'Invalid email or password',
          isLoading: false,
        });
        return;
      }

      set({
        ...buildMockAuthState(email.trim().toLowerCase()),
        isLoading: false,
      });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      set({
        session: data.session,
        user: data.user,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sign in',
        isLoading: false,
      });
    }
  },

  signUp: async (email: string, password: string) => {
    if (_testMode) {
      set({ isLoading: true, error: null });
      set({
        ...buildMockAuthState(email.trim().toLowerCase() || MOCK_USER.email),
        isLoading: false,
      });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      set({
        session: data.session,
        user: data.user,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sign up',
        isLoading: false,
      });
    }
  },

  signOut: async () => {
    if (_testMode) {
      set({
        session: null,
        user: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      set({
        session: null,
        user: null,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sign out',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
