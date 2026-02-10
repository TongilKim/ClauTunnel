import type { ModelInfo } from 'termbridge-shared';
import { getModelDisplayName } from './modelDisplayName';

export interface ModelBadgeState {
  /** Whether the badge should be rendered at all */
  visible: boolean;
  /** The model name to display (e.g. "Sonnet 4"), null when hidden */
  displayText: string | null;
  /** Whether to show a spinner instead of text (model is switching) */
  showSpinner: boolean;
}

export interface ModelBadgeInput {
  model: string | null;
  availableModels: ModelInfo[];
  isModelChanging: boolean;
}

/**
 * Computes the badge's derived state from store values.
 * Pure function — easy to test without React.
 */
export function getModelBadgeState(input: ModelBadgeInput): ModelBadgeState {
  const { model, availableModels, isModelChanging } = input;

  const displayName = getModelDisplayName(model, availableModels);
  const visible = displayName !== null;

  return {
    visible,
    displayText: visible ? displayName : null,
    showSpinner: visible && isModelChanging,
  };
}
