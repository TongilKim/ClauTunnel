import { describe, expect, it } from 'vitest';
import {
  decryptBootstrapRefreshToken,
  encryptBootstrapRefreshToken,
} from '../../../../supabase/functions/mobile-auth-bootstrap/crypto.ts';

describe('mobile auth bootstrap crypto', () => {
  it('encrypts and decrypts refresh tokens without storing plaintext', async () => {
    const secret = 'test-bootstrap-secret';
    const refreshToken = 'refresh-token-value';

    const encrypted = await encryptBootstrapRefreshToken(refreshToken, secret);

    expect(encrypted).not.toContain(refreshToken);
    await expect(
      decryptBootstrapRefreshToken(encrypted, secret)
    ).resolves.toBe(refreshToken);
  });
});
