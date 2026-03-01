import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface CreateSupabaseClientOptions {
  realtime?: boolean;
}

export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: CreateSupabaseClientOptions
): SupabaseClient {
  const clientOptions = options?.realtime
    ? {
        realtime: {
          params: { eventsPerSecond: 10 },
          timeout: 30000,
        },
      }
    : undefined;

  return createClient(url, anonKey, clientOptions);
}

export interface SessionTokenStore {
  getSessionTokens(): { accessToken: string; refreshToken: string } | null;
  setSessionTokens(tokens: { accessToken: string; refreshToken: string }): void;
  clearSessionTokens(): void;
}

export async function restoreSession(
  supabase: SupabaseClient,
  config: SessionTokenStore
): Promise<{ user: any } | null> {
  const sessionTokens = config.getSessionTokens();
  if (!sessionTokens) {
    return null;
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.setSession({
      access_token: sessionTokens.accessToken,
      refresh_token: sessionTokens.refreshToken,
    });

  if (sessionError) {
    config.clearSessionTokens();
    return null;
  }

  // Persist refreshed tokens if Supabase rotated them
  if (sessionData?.session) {
    const newAccess = sessionData.session.access_token;
    const newRefresh = sessionData.session.refresh_token;
    if (
      newAccess !== sessionTokens.accessToken ||
      newRefresh !== sessionTokens.refreshToken
    ) {
      config.setSessionTokens({
        accessToken: newAccess,
        refreshToken: newRefresh,
      });
    }
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  return { user };
}
