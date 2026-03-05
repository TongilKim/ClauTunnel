import { describe, it, expect } from 'vitest';
import { isSessionOnlineForUI, getSessionActivityLabel } from '../utils/sessionStatus';

describe('sessionStatus utils', () => {
  describe('isSessionOnlineForUI', () => {
    it('should return true for active session when cli status is true', () => {
      expect(isSessionOnlineForUI('active', true)).toBe(true);
    });

    it('should return false for active session when cli status is explicitly false', () => {
      expect(isSessionOnlineForUI('active', false)).toBe(false);
    });

    it('should return true for active session when cli status is unknown', () => {
      expect(isSessionOnlineForUI('active', undefined)).toBe(true);
    });

    it('should return false for non-active session regardless of cli status', () => {
      expect(isSessionOnlineForUI('ended', true)).toBe(false);
      expect(isSessionOnlineForUI('paused', true)).toBe(false);
      expect(isSessionOnlineForUI('ended', undefined)).toBe(false);
    });
  });

  describe('getSessionActivityLabel', () => {
    it('should return Active when active and not explicitly offline', () => {
      expect(getSessionActivityLabel('active', true)).toBe('Active');
      expect(getSessionActivityLabel('active', undefined)).toBe('Active');
    });

    it('should return Offline when active and explicitly offline', () => {
      expect(getSessionActivityLabel('active', false)).toBe('Offline');
    });

    it('should return Ended for non-active sessions', () => {
      expect(getSessionActivityLabel('ended', true)).toBe('Ended');
      expect(getSessionActivityLabel('paused', false)).toBe('Ended');
    });
  });
});
