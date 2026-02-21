import type { ModelInfo } from 'clautunnel-shared';

/**
 * Resolves the raw model string to a short display name for the badge.
 *
 * Uses the same matching logic as ModelPicker.isModelSelected:
 * - 'opus' / opus full identifier → display name from 'opus' entry
 * - 'sonnet' / sonnet full identifier → display name from 'sonnet' entry
 * - 'haiku' / haiku full identifier → display name from 'haiku' entry
 * - Returns null if model is null or no models available (badge hidden)
 * - Falls back to raw model string for unknown models
 */
export function getModelDisplayName(
  model: string | null,
  availableModels: ModelInfo[],
): string | null {
  if (!model || availableModels.length === 0) {
    return null;
  }

  // Find the matching model entry using the same logic as ModelPicker.isModelSelected
  let matched: ModelInfo | undefined;

  // 1. Shorthand match
  if (model === 'opus' || model === 'sonnet' || model === 'haiku') {
    matched = availableModels.find((m) => m.value === model);
  }
  // 2. Full identifier — check if it contains a known family keyword
  else {
    if (model.includes('opus')) {
      matched = availableModels.find((m) => m.value === 'opus');
    } else if (model.includes('sonnet')) {
      matched = availableModels.find((m) => m.value === 'sonnet');
    } else if (model.includes('haiku')) {
      matched = availableModels.find((m) => m.value === 'haiku');
    }
  }

  if (!matched) {
    // Fallback: return the raw model string
    return model;
  }

  return matched.displayName;
}
