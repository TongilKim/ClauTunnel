import { describe, it, expect } from 'vitest';
import { isPermissionMode } from '../index';

describe('isPermissionMode', () => {
  it('should return true for valid permission modes', () => {
    expect(isPermissionMode('default')).toBe(true);
    expect(isPermissionMode('acceptEdits')).toBe(true);
    expect(isPermissionMode('plan')).toBe(true);
    expect(isPermissionMode('bypassPermissions')).toBe(true);
    expect(isPermissionMode('delegate')).toBe(true);
    expect(isPermissionMode('dontAsk')).toBe(true);
  });

  it('should return false for invalid values', () => {
    expect(isPermissionMode('invalid')).toBe(false);
    expect(isPermissionMode('')).toBe(false);
    expect(isPermissionMode(null)).toBe(false);
    expect(isPermissionMode(undefined)).toBe(false);
    expect(isPermissionMode(123)).toBe(false);
    expect(isPermissionMode({ mode: 'plan' })).toBe(false);
  });
});
