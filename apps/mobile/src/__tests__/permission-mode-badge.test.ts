import { describe, it, expect } from 'vitest';
import { getPermissionModeBadgeState } from '../utils/permissionModeBadgeState';

describe('getPermissionModeBadgeState', () => {
  it('should hide badge when mode is null', () => {
    expect(getPermissionModeBadgeState(null)).toEqual({
      visible: false,
      label: null,
      tone: null,
    });
  });

  it('should show ask-before-edits label for default mode', () => {
    expect(getPermissionModeBadgeState('default')).toEqual({
      visible: true,
      label: 'Ask before edits',
      tone: 'neutral',
    });
  });

  it('should show auto-approve label for acceptEdits mode', () => {
    expect(getPermissionModeBadgeState('acceptEdits')).toEqual({
      visible: true,
      label: 'Auto-approve edits',
      tone: 'warning',
    });
  });

  it('should show plan mode label for plan mode', () => {
    expect(getPermissionModeBadgeState('plan')).toEqual({
      visible: true,
      label: 'Plan mode',
      tone: 'info',
    });
  });

  it('should show yolo mode label for bypassPermissions mode', () => {
    expect(getPermissionModeBadgeState('bypassPermissions')).toEqual({
      visible: true,
      label: 'Yolo mode',
      tone: 'danger',
    });
  });

  it('should map delegate to auto-approve label for sdk compatibility', () => {
    expect(getPermissionModeBadgeState('delegate')).toEqual({
      visible: true,
      label: 'Auto-approve edits',
      tone: 'warning',
    });
  });

  it('should map dontAsk to auto-approve label for sdk compatibility', () => {
    expect(getPermissionModeBadgeState('dontAsk')).toEqual({
      visible: true,
      label: 'Auto-approve edits',
      tone: 'warning',
    });
  });
});
