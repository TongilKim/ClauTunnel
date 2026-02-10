import { describe, it, expect } from 'vitest';
import { REALTIME_CHANNELS } from '../index';

describe('Constants', () => {
  describe('REALTIME_CHANNELS', () => {
    it('sessionOutput returns correct channel name format', () => {
      const sessionId = 'abc-123';
      const channelName = REALTIME_CHANNELS.sessionOutput(sessionId);
      expect(channelName).toBe('session:abc-123:output');
    });

    it('sessionInput returns correct channel name format', () => {
      const sessionId = 'abc-123';
      const channelName = REALTIME_CHANNELS.sessionInput(sessionId);
      expect(channelName).toBe('session:abc-123:input');
    });

    it('machinePresence returns correct channel name format', () => {
      const machineId = 'machine-456';
      const channelName = REALTIME_CHANNELS.machinePresence(machineId);
      expect(channelName).toBe('machine:machine-456:presence');
    });
  });

});
