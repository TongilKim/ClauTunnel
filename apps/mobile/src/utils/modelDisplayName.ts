import type { ModelInfo } from 'termbridge-shared';

/**
 * Resolves the raw model string to a short display name for the badge.
 *
 * Uses the same matching logic as ModelPicker.isModelSelected:
 * - 'default' / 'sonnet' / sonnet full identifier → display name from 'default' entry
 * - 'opus' / opus full identifier → display name from 'opus' entry
 * - 'haiku' / haiku full identifier → display name from 'haiku' entry
 * - Strips "(recommended)" from display names
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

  // 1. 'sonnet' should resolve via the 'default' entry (they are the same model)
  if (model === 'default' || model === 'sonnet') {
    matched = availableModels.find((m) => m.value === 'default');
  }
  // 2. Shorthand 'opus' or 'haiku' — direct match
  else if (model === 'opus' || model === 'haiku') {
    matched = availableModels.find((m) => m.value === model);
  }
  // 3. Full identifier — check if it contains a known family keyword
  else {
    if (model.includes('sonnet')) {
      matched = availableModels.find((m) => m.value === 'default');
    } else if (model.includes('opus')) {
      matched = availableModels.find((m) => m.value === 'opus');
    } else if (model.includes('haiku')) {
      matched = availableModels.find((m) => m.value === 'haiku');
    }
  }

  if (!matched) {
    // Fallback: return the raw model string
    return model;
  }

  // Strip "(recommended)" suffix and trim
  return matched.displayName.replace(/\s*\(recommended\)\s*/i, '').trim();
}
