import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  decryptBootstrapRefreshToken,
  encryptBootstrapRefreshToken,
} from './crypto.ts';
import {
  takeBootstrapClaimRateLimit,
  type BootstrapClaimRateLimitStore,
} from './rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOOTSTRAP_TTL_MS = 300_000;
const CLAIM_RATE_LIMIT_MAX_ATTEMPTS = 10;
const CLAIM_RATE_LIMIT_WINDOW_MS = 300_000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function generateCode() {
  return crypto.randomUUID().replace(/-/g, '');
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getClientRateLimitKey(req: Request) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();
  return 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const anonKey = getEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const bootstrapSecret = getEnv('MOBILE_AUTH_BOOTSTRAP_SECRET');
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json(400, { error: 'Invalid request body' });
    }

    const nowIso = new Date().toISOString();

    if (body.action === 'create') {
      const accessToken =
        typeof body.accessToken === 'string' ? body.accessToken.trim() : bearerToken;
      const refreshToken =
        typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';
      if (!accessToken || !refreshToken) {
        return json(400, { error: 'accessToken and refreshToken are required' });
      }

      const {
        data: { user },
        error: userError,
      } = await authedClient.auth.getUser();

      if (userError || !user) {
        return json(401, { error: 'Unauthorized' });
      }

      const code = generateCode();
      const codeHash = await sha256(code);
      const expiresAt = new Date(Date.now() + BOOTSTRAP_TTL_MS).toISOString();
      const encryptedRefreshToken = await encryptBootstrapRefreshToken(
        JSON.stringify({
          accessToken,
          refreshToken,
        }),
        bootstrapSecret
      );

      await serviceClient
        .from('mobile_auth_bootstraps')
        .delete()
        .not('used_at', 'is', null);
      await serviceClient
        .from('mobile_auth_bootstraps')
        .delete()
        .lt('expires_at', nowIso);

      const { error } = await serviceClient.from('mobile_auth_bootstraps').insert({
        user_id: user.id,
        code_hash: codeHash,
        encrypted_refresh_token: encryptedRefreshToken,
        expires_at: expiresAt,
      });

      if (error) {
        return json(500, { error: error.message });
      }

      return json(200, { code, expiresAt });
    }

    if (body.action === 'claim') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!code) {
        return json(400, { error: 'code is required' });
      }

      const rateLimitStore: BootstrapClaimRateLimitStore = {
        async cleanupExpired(cutoffIso: string) {
          await serviceClient
            .from('mobile_auth_claim_rate_limits')
            .delete()
            .lt('window_started_at', cutoffIso);
        },
        async get(keyHash: string) {
          const { data, error } = await serviceClient
            .from('mobile_auth_claim_rate_limits')
            .select('key_hash, attempt_count, window_started_at')
            .eq('key_hash', keyHash)
            .maybeSingle();

          if (error || !data) {
            return null;
          }

          return {
            keyHash: data.key_hash,
            attemptCount: data.attempt_count,
            windowStartedAt: data.window_started_at,
          };
        },
        async put(record) {
          const { error } = await serviceClient
            .from('mobile_auth_claim_rate_limits')
            .upsert({
              key_hash: record.keyHash,
              attempt_count: record.attemptCount,
              window_started_at: record.windowStartedAt,
            });

          if (error) {
            throw new Error(error.message);
          }
        },
      };

      const rateLimit = await takeBootstrapClaimRateLimit(rateLimitStore, {
        clientKey: getClientRateLimitKey(req),
        now: new Date(),
        maxAttempts: CLAIM_RATE_LIMIT_MAX_ATTEMPTS,
        windowMs: CLAIM_RATE_LIMIT_WINDOW_MS,
      });

      if (!rateLimit.allowed) {
        return new Response(
          JSON.stringify({
            error: 'Too many bootstrap claim attempts. Please wait and try again.',
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': String(rateLimit.retryAfterSec ?? 60),
            },
          }
        );
      }

      const codeHash = await sha256(code);
      const { data, error } = await serviceClient
        .from('mobile_auth_bootstraps')
        .update({ used_at: nowIso })
        .eq('code_hash', codeHash)
        .is('used_at', null)
        .gt('expires_at', nowIso)
        .select('encrypted_refresh_token')
        .maybeSingle();

      if (error) {
        return json(500, { error: error.message });
      }

      if (!data?.encrypted_refresh_token) {
        return json(410, { error: 'Bootstrap code is invalid or expired' });
      }

      const sessionPayload = await decryptBootstrapRefreshToken(
        data.encrypted_refresh_token,
        bootstrapSecret
      );
      const parsedPayload = JSON.parse(sessionPayload) as {
        accessToken?: string;
        refreshToken?: string;
      };
      const accessToken =
        typeof parsedPayload.accessToken === 'string' ? parsedPayload.accessToken : '';
      const refreshToken =
        typeof parsedPayload.refreshToken === 'string' ? parsedPayload.refreshToken : '';

      if (!accessToken || !refreshToken) {
        return json(500, { error: 'Stored bootstrap session payload is invalid' });
      }

      return json(200, { accessToken, refreshToken });
    }

    return json(400, { error: 'Unsupported action' });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Unexpected error',
    });
  }
});
