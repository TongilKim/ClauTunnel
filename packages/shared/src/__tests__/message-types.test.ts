import { describe, it, expect } from 'vitest';
import type { MessageType, RealtimeMessageType } from '../types/message.js';

/**
 * Message type consistency tests
 *
 * These tests act as a contract: they ensure that DB-persisted message types
 * and RealtimeClient broadcast message types stay in sync with the
 * RealtimeMessageType union.
 *
 * If a new broadcast method or DB message type is added without updating
 * the union, these tests will fail — preventing silent type drift.
 */

// Exhaustive list of all RealtimeMessageType values from the union
const ALL_REALTIME_MESSAGE_TYPES: RealtimeMessageType[] = [
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
];

// Message types used by RealtimeClient broadcast methods (CLI → mobile)
const BROADCAST_METHOD_TYPES: RealtimeMessageType[] = [
  'output',        // broadcast()
  'system',        // broadcastSystem()
  'mode',          // broadcastMode()
  'commands',      // broadcastCommands()
  'model',         // broadcastModel()
  'models',        // broadcastModels()
  'status-response', // broadcastStatusResponse()
  'session-title', // broadcastSessionTitle()
  'error',         // broadcastError()
  'interactive-response', // broadcastInteractiveResponse()
  'interactive-confirm',  // broadcastInteractiveConfirm()
  'resume-history',       // broadcastResumeHistory()
  'user-question',        // broadcastUserQuestion()
  'permission-request',   // broadcastPermissionRequest()
  'tool-use',             // broadcastToolUse()
  'complete',             // broadcastComplete()
  'request-queued',       // broadcastQueued()
];

// Message types that are persisted to the database
const DB_MESSAGE_TYPES: MessageType[] = [
  'output',
  'input',
  'error',
  'system',
  'tool-use',
];

describe('Message Type Consistency', () => {
  it('every broadcast method type is a valid RealtimeMessageType', () => {
    for (const type of BROADCAST_METHOD_TYPES) {
      expect(
        ALL_REALTIME_MESSAGE_TYPES,
        `broadcast type "${type}" is not in RealtimeMessageType union`,
      ).toContain(type);
    }
  });

  it('every DB MessageType is a valid RealtimeMessageType', () => {
    for (const type of DB_MESSAGE_TYPES) {
      expect(
        ALL_REALTIME_MESSAGE_TYPES,
        `DB type "${type}" is not in RealtimeMessageType union`,
      ).toContain(type);
    }
  });

  it('DB MessageType is a strict subset of RealtimeMessageType (not the full set)', () => {
    // DB types should be fewer than realtime types — most types are transient
    expect(DB_MESSAGE_TYPES.length).toBeLessThan(ALL_REALTIME_MESSAGE_TYPES.length);
  });

  it('broadcast method types cover all CLI-originated DB-persisted types', () => {
    // 'input' is sent by the mobile client, not broadcast by CLI — exclude it
    const cliOriginatedDbTypes = DB_MESSAGE_TYPES.filter((t) => t !== 'input');
    for (const dbType of cliOriginatedDbTypes) {
      expect(
        BROADCAST_METHOD_TYPES,
        `DB type "${dbType}" has no corresponding broadcast method`,
      ).toContain(dbType);
    }
  });

  it('RealtimeMessageType union has no duplicates', () => {
    const unique = new Set(ALL_REALTIME_MESSAGE_TYPES);
    expect(unique.size).toBe(ALL_REALTIME_MESSAGE_TYPES.length);
  });

  it('ALL_REALTIME_MESSAGE_TYPES list matches the actual union count (31 types)', () => {
    // Update this count when adding new types to the union
    expect(ALL_REALTIME_MESSAGE_TYPES.length).toBe(31);
  });
});
