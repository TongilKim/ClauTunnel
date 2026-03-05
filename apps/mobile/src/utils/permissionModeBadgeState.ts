import type { PermissionMode } from 'clautunnel-shared';

export type PermissionModeBadgeTone = 'neutral' | 'warning' | 'info' | 'danger';

export interface PermissionModeBadgeState {
  visible: boolean;
  label: string | null;
  tone: PermissionModeBadgeTone | null;
}

export function getPermissionModeBadgeState(mode: PermissionMode | null): PermissionModeBadgeState {
  if (!mode) {
    return {
      visible: false,
      label: null,
      tone: null,
    };
  }

  switch (mode) {
    case 'default':
      return {
        visible: true,
        label: 'Ask before edits',
        tone: 'neutral',
      };
    case 'plan':
      return {
        visible: true,
        label: 'Plan mode',
        tone: 'info',
      };
    case 'bypassPermissions':
      return {
        visible: true,
        label: 'Yolo mode',
        tone: 'danger',
      };
    case 'acceptEdits':
    case 'delegate':
    case 'dontAsk':
      return {
        visible: true,
        label: 'Auto-approve edits',
        tone: 'warning',
      };
    default:
      return {
        visible: false,
        label: null,
        tone: null,
      };
  }
}
