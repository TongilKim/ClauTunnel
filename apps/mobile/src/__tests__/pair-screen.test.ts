import { describe, it, expect } from 'vitest';

/**
 * Pair screen decision logic tests.
 *
 * The PairScreen component uses two useEffect hooks and a render condition
 * that depend on `code`, `attemptedCode`, and the auth store state.
 * These tests verify the branching logic without needing React rendering.
 */

// Mirrors the cold-start effect guard: code && code !== attemptedCode
function shouldRedeemColdStart(
  code: string | undefined,
  attemptedCode: string | null
): boolean {
  return !!code && code !== attemptedCode;
}

// Mirrors the warm-start URL event guard: parsed code !== attemptedCodeRef.current
function shouldRedeemWarmStart(
  parsedCode: string | null,
  attemptedCodeRef: string | null
): boolean {
  return !!parsedCode && parsedCode !== attemptedCodeRef;
}

// Mirrors the render condition: isLoading || (code && code !== attemptedCode)
function shouldShowSpinner(
  isLoading: boolean,
  code: string | undefined,
  attemptedCode: string | null
): boolean {
  return isLoading || (!!code && code !== attemptedCode);
}

// Mirrors the URL parsing in the warm-start handler
function parseCodeFromUrl(url: string): string | null {
  const match = url.match(/code=([^&]+)/);
  return match ? match[1] : null;
}

describe('PairScreen logic', () => {
  describe('cold-start deep link', () => {
    it('should redeem when code is present and not yet attempted', () => {
      expect(shouldRedeemColdStart('abc-123', null)).toBe(true);
    });

    it('should not redeem when code matches attemptedCode', () => {
      expect(shouldRedeemColdStart('abc-123', 'abc-123')).toBe(false);
    });

    it('should not redeem when code is undefined', () => {
      expect(shouldRedeemColdStart(undefined, null)).toBe(false);
    });

    it('should redeem a new code after a previous attempt failed', () => {
      // Previous code was attempted but failed; new QR scan gives a new code
      expect(shouldRedeemColdStart('new-code', 'old-failed-code')).toBe(true);
    });
  });

  describe('warm-start URL event', () => {
    it('should redeem when parsed code is new', () => {
      expect(shouldRedeemWarmStart('abc-123', null)).toBe(true);
    });

    it('should not re-redeem the same code', () => {
      expect(shouldRedeemWarmStart('abc-123', 'abc-123')).toBe(false);
    });

    it('should redeem a different code', () => {
      expect(shouldRedeemWarmStart('new-code', 'old-code')).toBe(true);
    });

    it('should not redeem when parsed code is null', () => {
      expect(shouldRedeemWarmStart(null, null)).toBe(false);
    });
  });

  describe('URL parsing', () => {
    it('should extract code from deep link URL', () => {
      expect(parseCodeFromUrl('clautunnel://pair?code=abc-123')).toBe('abc-123');
    });

    it('should extract code when there are additional params', () => {
      expect(parseCodeFromUrl('clautunnel://pair?code=abc-123&other=val')).toBe('abc-123');
    });

    it('should return null when no code param exists', () => {
      expect(parseCodeFromUrl('clautunnel://pair')).toBeNull();
    });

    it('should return null for empty URL', () => {
      expect(parseCodeFromUrl('')).toBeNull();
    });
  });

  describe('render state (spinner vs error vs instructions)', () => {
    it('should show spinner when isLoading is true', () => {
      expect(shouldShowSpinner(true, undefined, null)).toBe(true);
    });

    it('should show spinner when code is present but not yet attempted', () => {
      // This prevents the error/instructions screen from flashing
      expect(shouldShowSpinner(false, 'abc-123', null)).toBe(true);
    });

    it('should show spinner when isLoading and code both present', () => {
      expect(shouldShowSpinner(true, 'abc-123', null)).toBe(true);
    });

    it('should not show spinner when code was already attempted and not loading', () => {
      // After attempt completes (success or failure), show the result
      expect(shouldShowSpinner(false, 'abc-123', 'abc-123')).toBe(false);
    });

    it('should not show spinner when no code and not loading', () => {
      // Initial state: show instructions
      expect(shouldShowSpinner(false, undefined, null)).toBe(false);
    });

    it('should show spinner for new code even if previous attempt finished', () => {
      // New QR scanned after a previous failure
      expect(shouldShowSpinner(false, 'new-code', 'old-code')).toBe(true);
    });
  });
});
