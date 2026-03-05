import type { PermissionMode } from '../types/message.js';

const VALID_PERMISSION_MODES: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'delegate',
  'dontAsk',
];

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && VALID_PERMISSION_MODES.includes(value as PermissionMode);
}
