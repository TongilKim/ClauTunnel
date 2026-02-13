import { describe, it, expect } from 'vitest';
import { MIN_INPUT_HEIGHT, MAX_INPUT_HEIGHT } from '../utils/inputBarConstants';

/**
 * InputBar layout constants and scroll logic tests.
 *
 * The TextInput auto-grows via minHeight / maxHeight (no explicit height).
 * scrollEnabled flips to true only when content reaches MAX_INPUT_HEIGHT.
 */

/** Mirrors the logic inside handleContentSizeChange */
function computeScrollEnabled(contentHeight: number): boolean {
  return contentHeight >= MAX_INPUT_HEIGHT;
}

describe('InputBar scroll logic', () => {
  it('should disable scroll when content height is below minimum', () => {
    expect(computeScrollEnabled(20)).toBe(false);
  });

  it('should disable scroll when content height equals minimum', () => {
    expect(computeScrollEnabled(MIN_INPUT_HEIGHT)).toBe(false);
  });

  it('should disable scroll for single-line content', () => {
    expect(computeScrollEnabled(40)).toBe(false);
  });

  it('should disable scroll for multi-line content below max', () => {
    expect(computeScrollEnabled(80)).toBe(false);
    expect(computeScrollEnabled(MAX_INPUT_HEIGHT - 1)).toBe(false);
  });

  it('should enable scroll when content height equals max', () => {
    expect(computeScrollEnabled(MAX_INPUT_HEIGHT)).toBe(true);
  });

  it('should enable scroll when content height exceeds max', () => {
    expect(computeScrollEnabled(200)).toBe(true);
    expect(computeScrollEnabled(500)).toBe(true);
  });
});

describe('InputBar style constraints', () => {
  it('should have MIN_INPUT_HEIGHT < MAX_INPUT_HEIGHT', () => {
    expect(MIN_INPUT_HEIGHT).toBeLessThan(MAX_INPUT_HEIGHT);
  });

  it('should have reasonable min height for single line', () => {
    expect(MIN_INPUT_HEIGHT).toBeGreaterThanOrEqual(30);
    expect(MIN_INPUT_HEIGHT).toBeLessThanOrEqual(44);
  });

  it('should have reasonable max height for multiline expansion', () => {
    expect(MAX_INPUT_HEIGHT).toBeGreaterThanOrEqual(100);
    expect(MAX_INPUT_HEIGHT).toBeLessThanOrEqual(200);
  });
});
