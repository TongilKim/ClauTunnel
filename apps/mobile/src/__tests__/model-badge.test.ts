import { describe, it, expect } from 'vitest';
import type { ModelInfo } from 'termbridge-shared';
import { getModelDisplayName } from '../utils/modelDisplayName';
import { getModelBadgeState } from '../utils/modelBadgeState';

// Sample model data matching real CLI output
const sampleModels: ModelInfo[] = [
  { value: 'default', displayName: 'Opus 4.6 (recommended)', description: 'Claude Opus 4.6 — most capable' },
  { value: 'opus', displayName: 'Opus 4.6', description: 'Claude Opus 4.6 — most capable' },
  { value: 'haiku', displayName: 'Haiku 3.5', description: 'Claude Haiku 3.5 — fastest' },
  { value: 'sonnet', displayName: 'Sonnet 4.5', description: 'Claude Sonnet 4.5 — balanced performance' },
];

describe('getModelDisplayName', () => {
  describe('returns correct display name for shorthand model values', () => {
    it('should return "Opus 4.6" for model "default"', () => {
      expect(getModelDisplayName('default', sampleModels)).toBe('Opus 4.6');
    });

    it('should return "Opus 4.6" for model "opus" (resolves via default entry)', () => {
      expect(getModelDisplayName('opus', sampleModels)).toBe('Opus 4.6');
    });

    it('should return "Haiku 3.5" for model "haiku"', () => {
      expect(getModelDisplayName('haiku', sampleModels)).toBe('Haiku 3.5');
    });

    it('should return "Sonnet 4.5" for model "sonnet"', () => {
      expect(getModelDisplayName('sonnet', sampleModels)).toBe('Sonnet 4.5');
    });
  });

  describe('returns correct display name for full model identifiers', () => {
    it('should return "Sonnet 4.5" for full sonnet identifier', () => {
      expect(getModelDisplayName('claude-sonnet-4-5-20250929', sampleModels)).toBe('Sonnet 4.5');
    });

    it('should return "Opus 4.6" for full opus identifier', () => {
      expect(getModelDisplayName('claude-opus-4-6-20250219', sampleModels)).toBe('Opus 4.6');
    });

    it('should return "Haiku 3.5" for full haiku identifier', () => {
      expect(getModelDisplayName('claude-3-5-haiku-20241022', sampleModels)).toBe('Haiku 3.5');
    });
  });

  describe('strips "(recommended)" from display names', () => {
    it('should strip "(recommended)" suffix from display name', () => {
      const result = getModelDisplayName('default', sampleModels);
      expect(result).not.toContain('(recommended)');
      expect(result).toBe('Opus 4.6');
    });
  });

  describe('handles edge cases', () => {
    it('should return null when model is null', () => {
      expect(getModelDisplayName(null, sampleModels)).toBeNull();
    });

    it('should return null when availableModels is empty', () => {
      expect(getModelDisplayName('default', [])).toBeNull();
    });

    it('should return null when both model is null and models are empty', () => {
      expect(getModelDisplayName(null, [])).toBeNull();
    });

    it('should return the raw model string as fallback for unknown models', () => {
      expect(getModelDisplayName('some-custom-model', sampleModels)).toBe('some-custom-model');
    });
  });

  describe('matching logic consistency with ModelPicker.isModelSelected', () => {
    it('should resolve "default" using the default entry, not the opus entry', () => {
      const result = getModelDisplayName('default', sampleModels);
      expect(result).toBe('Opus 4.6');
    });

    it('should resolve full opus identifier via the default entry', () => {
      const result = getModelDisplayName('claude-opus-4-6-20250219', sampleModels);
      expect(result).toBe('Opus 4.6');
    });

    it('should resolve full sonnet identifier via sonnet shorthand entry', () => {
      const result = getModelDisplayName('claude-sonnet-4-5-20250929', sampleModels);
      expect(result).toBe('Sonnet 4.5');
    });

    it('should resolve full haiku identifier via haiku shorthand entry', () => {
      const result = getModelDisplayName('claude-3-5-haiku-20241022', sampleModels);
      expect(result).toBe('Haiku 3.5');
    });
  });
});

describe('getModelBadgeState', () => {
  describe('visibility', () => {
    it('should be hidden when model is null (before first message)', () => {
      const state = getModelBadgeState({
        model: null,
        availableModels: sampleModels,
        isModelChanging: false,
      });
      expect(state.visible).toBe(false);
    });

    it('should be hidden when availableModels is empty', () => {
      const state = getModelBadgeState({
        model: 'default',
        availableModels: [],
        isModelChanging: false,
      });
      expect(state.visible).toBe(false);
    });

    it('should be visible when model and availableModels are present', () => {
      const state = getModelBadgeState({
        model: 'default',
        availableModels: sampleModels,
        isModelChanging: false,
      });
      expect(state.visible).toBe(true);
    });
  });

  describe('display text', () => {
    it('should show just the model name without any chevron', () => {
      const state = getModelBadgeState({
        model: 'default',
        availableModels: sampleModels,
        isModelChanging: false,
      });
      expect(state.displayText).toBe('Opus 4.6');
      expect(state.displayText).not.toContain('\u25BE');
    });

    it('should be null when badge is not visible', () => {
      const state = getModelBadgeState({
        model: null,
        availableModels: sampleModels,
        isModelChanging: false,
      });
      expect(state.displayText).toBeNull();
    });
  });

  describe('loading state', () => {
    it('should show loading when isModelChanging is true', () => {
      const state = getModelBadgeState({
        model: 'default',
        availableModels: sampleModels,
        isModelChanging: true,
      });
      expect(state.showSpinner).toBe(true);
      expect(state.visible).toBe(true);
    });

    it('should not show loading when isModelChanging is false', () => {
      const state = getModelBadgeState({
        model: 'default',
        availableModels: sampleModels,
        isModelChanging: false,
      });
      expect(state.showSpinner).toBe(false);
    });
  });

  describe('model transitions', () => {
    it('should update display text after model change completes', () => {
      // Before: Opus 4.6
      const before = getModelBadgeState({
        model: 'default',
        availableModels: sampleModels,
        isModelChanging: false,
      });
      expect(before.displayText).toBe('Opus 4.6');

      // During: spinner shown
      const during = getModelBadgeState({
        model: 'default',
        availableModels: sampleModels,
        isModelChanging: true,
      });
      expect(during.showSpinner).toBe(true);

      // After: Sonnet 4.5
      const after = getModelBadgeState({
        model: 'sonnet',
        availableModels: sampleModels,
        isModelChanging: false,
      });
      expect(after.displayText).toBe('Sonnet 4.5');
      expect(after.showSpinner).toBe(false);
    });
  });
});
