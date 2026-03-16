// Source of truth for message types.
// TypeScript types are derived from these arrays via (typeof X)[number].
// Tests import these arrays directly — no manual duplication needed.

export const REALTIME_MESSAGE_TYPES = [
  'output',
  'input',
  'error',
  'system',
  'mode',
  'mode-change',
  'commands',
  'commands-request',
  'model',
  'model-change',
  'models',
  'models-request',
  'mobile-disconnect',
  'interactive-request',
  'interactive-response',
  'interactive-apply',
  'interactive-confirm',
  'cancel-request',
  'clear-request',
  'resume-request',
  'resume-history',
  'user-question',
  'user-answer',
  'permission-request',
  'permission-response',
  'request-queued',
  'status-request',
  'status-response',
  'session-title',
  'tool-use',
  'complete',
] as const;

export const MESSAGE_TYPES = [
  'output',
  'input',
  'error',
  'system',
  'tool-use',
] as const;
