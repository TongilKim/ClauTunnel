import { describe, expect, it } from 'vitest';
import { shouldPrimeSessionScreen } from '../utils/sessionBootstrap';

describe('shouldPrimeSessionScreen', () => {
  it('returns false in test mode', () => {
    expect(
      shouldPrimeSessionScreen({
        isTestModeEnabled: true,
        authIsLoading: false,
        userId: 'user-1',
        primedUserId: null,
      })
    ).toBe(false);
  });

  it('returns false while auth is loading', () => {
    expect(
      shouldPrimeSessionScreen({
        isTestModeEnabled: false,
        authIsLoading: true,
        userId: 'user-1',
        primedUserId: null,
      })
    ).toBe(false);
  });

  it('returns false when there is no authenticated user', () => {
    expect(
      shouldPrimeSessionScreen({
        isTestModeEnabled: false,
        authIsLoading: false,
        userId: null,
        primedUserId: null,
      })
    ).toBe(false);
  });

  it('returns true once per authenticated user', () => {
    expect(
      shouldPrimeSessionScreen({
        isTestModeEnabled: false,
        authIsLoading: false,
        userId: 'user-1',
        primedUserId: null,
      })
    ).toBe(true);

    expect(
      shouldPrimeSessionScreen({
        isTestModeEnabled: false,
        authIsLoading: false,
        userId: 'user-1',
        primedUserId: 'user-1',
      })
    ).toBe(false);
  });

  it('returns true again for a different user', () => {
    expect(
      shouldPrimeSessionScreen({
        isTestModeEnabled: false,
        authIsLoading: false,
        userId: 'user-2',
        primedUserId: 'user-1',
      })
    ).toBe(true);
  });
});
