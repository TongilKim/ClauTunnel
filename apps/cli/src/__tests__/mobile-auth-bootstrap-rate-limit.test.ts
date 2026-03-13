import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  takeBootstrapClaimRateLimit,
  type BootstrapClaimRateLimitRecord,
  type BootstrapClaimRateLimitStore,
} from '../../../../supabase/functions/mobile-auth-bootstrap/rate-limit.ts';

class InMemoryRateLimitStore implements BootstrapClaimRateLimitStore {
  record: BootstrapClaimRateLimitRecord | null = null;
  cleanupExpired = vi.fn(async () => {});

  async get(keyHash: string) {
    if (this.record?.keyHash === keyHash) {
      return this.record;
    }
    return null;
  }

  async put(record: BootstrapClaimRateLimitRecord) {
    this.record = record;
  }
}

describe('mobile auth bootstrap claim rate limit', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    vi.stubGlobal('crypto', webcrypto);
  });

  it('allows claim attempts within the limit and increments the counter', async () => {
    const now = new Date('2026-03-12T12:00:00.000Z');

    const first = await takeBootstrapClaimRateLimit(store, {
      clientKey: '203.0.113.5',
      now,
      maxAttempts: 3,
      windowMs: 60_000,
    });
    const second = await takeBootstrapClaimRateLimit(store, {
      clientKey: '203.0.113.5',
      now: new Date('2026-03-12T12:00:10.000Z'),
      maxAttempts: 3,
      windowMs: 60_000,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(store.record?.attemptCount).toBe(2);
    expect(store.cleanupExpired).toHaveBeenCalledTimes(2);
  });

  it('blocks claim attempts after the limit is reached', async () => {
    const now = new Date('2026-03-12T12:00:00.000Z');

    await takeBootstrapClaimRateLimit(store, {
      clientKey: '203.0.113.5',
      now,
      maxAttempts: 2,
      windowMs: 60_000,
    });
    await takeBootstrapClaimRateLimit(store, {
      clientKey: '203.0.113.5',
      now: new Date('2026-03-12T12:00:05.000Z'),
      maxAttempts: 2,
      windowMs: 60_000,
    });
    const third = await takeBootstrapClaimRateLimit(store, {
      clientKey: '203.0.113.5',
      now: new Date('2026-03-12T12:00:06.000Z'),
      maxAttempts: 2,
      windowMs: 60_000,
    });

    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThan(0);
    expect(store.record?.attemptCount).toBe(2);
  });

  it('starts a fresh window after the previous one expires', async () => {
    await takeBootstrapClaimRateLimit(store, {
      clientKey: '203.0.113.5',
      now: new Date('2026-03-12T12:00:00.000Z'),
      maxAttempts: 2,
      windowMs: 60_000,
    });
    await takeBootstrapClaimRateLimit(store, {
      clientKey: '203.0.113.5',
      now: new Date('2026-03-12T12:01:30.000Z'),
      maxAttempts: 2,
      windowMs: 60_000,
    });

    expect(store.record?.attemptCount).toBe(1);
    expect(store.record?.windowStartedAt).toBe('2026-03-12T12:01:30.000Z');
  });
});
