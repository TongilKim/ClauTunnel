import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  decryptBootstrapRefreshToken,
  encryptBootstrapRefreshToken,
} from './crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BOOTSTRAP_TTL_MS = 300_000;

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
      const refreshToken =
        typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';
      if (!refreshToken) {
        return json(400, { error: 'refreshToken is required' });
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
        refreshToken,
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

      const refreshToken = await decryptBootstrapRefreshToken(
        data.encrypted_refresh_token,
        bootstrapSecret
      );

      return json(200, { refreshToken });
    }

    return json(400, { error: 'Unsupported action' });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Unexpected error',
    });
  }
});
