import { describe, it, expect } from 'vitest';
import { REALTIME_MESSAGE_TYPES, MESSAGE_TYPES } from '../constants/message-types.js';
import type { RealtimeMessageType } from '../types/message.js';

/**
 * Message type consistency tests
 *
 * REALTIME_MESSAGE_TYPES and MESSAGE_TYPES are the runtime source of truth
 * (defined in constants/message-types.ts). The TypeScript types are derived
 * from them, so adding/removing a value in the array automatically updates
 * the type AND these tests.
 *
 * BROADCAST_METHOD_TYPES is still manually maintained because there is no
 * way to programmatically extract which types each RealtimeClient broadcast
 * method uses at runtime. If you add a new broadcast method, update this list.
 */

// Message types used by RealtimeClient broadcast methods (CLI → mobile).
// Manually maintained — update when adding/removing broadcast methods.
const BROADCAST_METHOD_TYPES: RealtimeMessageType[] = [
  'output',              // broadcast()
  'system',              // broadcastSystem()
  'mode',                // broadcastMode()
  'commands',            // broadcastCommands()
  'model',               // broadcastModel()
  'models',              // broadcastModels()
  'status-response',     // broadcastStatusResponse()
  'session-title',       // broadcastSessionTitle()
  'error',               // broadcastError()
  'interactive-response', // broadcastInteractiveResponse()
  'interactive-confirm',  // broadcastInteractiveConfirm()
  'resume-history',       // broadcastResumeHistory()
  'user-question',        // broadcastUserQuestion()
  'permission-request',   // broadcastPermissionRequest()
  'tool-use',             // broadcastToolUse()
  'complete',             // broadcastComplete()
  'request-queued',       // broadcastQueued()
];

describe('Message Type Consistency', () => {
  it('every broadcast method type is a valid RealtimeMessageType', () => {
    for (const type of BROADCAST_METHOD_TYPES) {
      expect(
        REALTIME_MESSAGE_TYPES as readonly string[],
        `broadcast type "${type}" is not in RealtimeMessageType`,
      ).toContain(type);
    }
  });

  it('every DB MessageType is a valid RealtimeMessageType', () => {
    for (const type of MESSAGE_TYPES) {
      expect(
        REALTIME_MESSAGE_TYPES as readonly string[],
        `DB type "${type}" is not in RealtimeMessageType`,
      ).toContain(type);
    }
  });

  it('DB MessageType is a strict subset of RealtimeMessageType (not the full set)', () => {
    expect(MESSAGE_TYPES.length).toBeLessThan(REALTIME_MESSAGE_TYPES.length);
  });

  it('broadcast method types cover all CLI-originated DB-persisted types', () => {
    // 'input' is sent by the mobile client, not broadcast by CLI — exclude it
    const cliOriginatedDbTypes = MESSAGE_TYPES.filter((t) => t !== 'input');
    for (const dbType of cliOriginatedDbTypes) {
      expect(
        BROADCAST_METHOD_TYPES,
        `DB type "${dbType}" has no corresponding broadcast method`,
      ).toContain(dbType);
    }
  });

  it('RealtimeMessageType has no duplicates', () => {
    const unique = new Set(REALTIME_MESSAGE_TYPES);
    expect(unique.size).toBe(REALTIME_MESSAGE_TYPES.length);
  });

  it('DB MessageType has no duplicates', () => {
    const unique = new Set(MESSAGE_TYPES);
    expect(unique.size).toBe(MESSAGE_TYPES.length);
  });
});
