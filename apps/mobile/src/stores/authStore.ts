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
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  claimBootstrapCode: (code: string, options?: { signal?: AbortSignal }) => Promise<boolean>;
  signInWithToken: (refreshToken: string, options?: { signal?: AbortSignal }) => Promise<boolean>;
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

let _authSubscription: { unsubscribe: () => void } | null = null;

function listenForAuthChanges(set: (state: Partial<AuthState>) => void) {
  _authSubscription?.unsubscribe();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    set({
      session,
      user: session?.user ?? null,
    });
  });
  _authSubscription = subscription;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: _testMode ? (buildMockAuthState().user as User) : null,
  session: _testMode ? (buildMockAuthState().session as Session) : null,
  isLoading: _testMode ? false : true,
  error: null,

  initialize: async () => {
    if (_testMode) {
      set({ isLoading: true, error: null });
      set({
        ...buildMockAuthState(),
        isLoading: false,
        error: null,
      });
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

  claimBootstrapCode: async (code: string, options?: { signal?: AbortSignal }) => {
    try {
      if (options?.signal?.aborted) {
        return false;
      }

      set({ isLoading: true, error: null });

      const { data, error } = await supabase.functions.invoke('mobile-auth-bootstrap', {
        body: { action: 'claim', code },
      });

      if (options?.signal?.aborted) {
        set({ isLoading: false });
        return false;
      }

      if (error) throw error;

      const accessToken =
        data && typeof data.accessToken === 'string' ? data.accessToken : '';
      const refreshToken =
        data && typeof data.refreshToken === 'string' ? data.refreshToken : '';

      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (options?.signal?.aborted) {
          set({ isLoading: false });
          return false;
        }

        if (sessionError) throw sessionError;

        set({
          session: sessionData.session,
          user: sessionData.session?.user ?? null,
          isLoading: false,
        });

        listenForAuthChanges(set);
        return true;
      }

      if (!refreshToken) {
        throw new Error('Bootstrap response missing session tokens');
      }

      return await get().signInWithToken(refreshToken, options);
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        set({ isLoading: false });
        return false;
      }
      set({
        error: getErrorMessage(error, 'Failed to claim bootstrap code'),
        isLoading: false,
      });
      return false;
    }
  },

  signInWithToken: async (refreshToken: string, options?: { signal?: AbortSignal }) => {
    try {
      if (options?.signal?.aborted) {
        return false;
      }

      set({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (options?.signal?.aborted) {
        set({ isLoading: false });
        return false;
      }

      if (error) throw error;

      set({
        session: data.session,
        user: data.session?.user ?? null,
        isLoading: false,
      });

      listenForAuthChanges(set);

      return true;
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        set({ isLoading: false });
        return false;
      }
      set({
        error: getErrorMessage(error, 'Failed to authenticate'),
        isLoading: false,
      });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
