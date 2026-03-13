export interface CreateMobileAuthBootstrapParams {
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken: string;
  refreshToken: string;
}

export interface MobileAuthBootstrap {
  code: string;
  expiresAt: string;
}

export async function createMobileAuthBootstrap({
  supabaseUrl,
  supabaseAnonKey,
  accessToken,
  refreshToken,
}: CreateMobileAuthBootstrapParams): Promise<MobileAuthBootstrap> {
  const response = await fetch(`${supabaseUrl}/functions/v1/mobile-auth-bootstrap`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'create',
      accessToken,
      refreshToken,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to create mobile auth bootstrap';
    throw new Error(errorMessage);
  }

  if (
    !payload ||
    typeof payload.code !== 'string' ||
    typeof payload.expiresAt !== 'string'
  ) {
    throw new Error('Invalid mobile auth bootstrap response');
  }

  return {
    code: payload.code,
    expiresAt: payload.expiresAt,
  };
}
