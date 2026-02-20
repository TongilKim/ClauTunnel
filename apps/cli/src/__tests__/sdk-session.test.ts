import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAttachment, ModelInfo, SlashCommand } from 'termbridge-shared';

// Helper to let the background stream loop process messages
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

// Helper to create a mock V2 session
function createMockSession(messages: any[]) {
  const sendMock = vi.fn().mockResolvedValue(undefined);
  const closeMock = vi.fn();
  let streamConsumed = false;

  const session = {
    closed: false,
    get sessionId() {
      const init = messages.find((m: any) => m.type === 'system' && m.subtype === 'init');
      return init?.session_id || '';
    },
    send: sendMock,
    stream: async function* () {
      if (streamConsumed) {
        // On subsequent calls, block forever (simulates waiting for next user input)
        await new Promise(() => {});
        return;
      }
      streamConsumed = true;
      for (const msg of messages) {
        yield msg;
      }
    },
    close: () => {
      session.closed = true;
      closeMock();
    },
    [Symbol.asyncDispose]: async () => {},
    _sendMock: sendMock,
    _closeMock: closeMock,
  };

  return session;
}

// Mock Claude Agent SDK V2
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  unstable_v2_createSession: vi.fn(),
  unstable_v2_resumeSession: vi.fn(),
}));

import { SdkSession } from '../daemon/sdk-session.js';
import { unstable_v2_createSession, unstable_v2_resumeSession } from '@anthropic-ai/claude-agent-sdk';

describe('SdkSession', () => {
  let sdkSession: SdkSession;
  const mockedCreateSession = vi.mocked(unstable_v2_createSession);
  const mockedResumeSession = vi.mocked(unstable_v2_resumeSession);

  beforeEach(() => {
    vi.clearAllMocks();
    sdkSession = new SdkSession({ cwd: '/test' });

    // Default mock - creates a session that yields init + result
    const defaultSession = createMockSession([
      { type: 'system', subtype: 'init', session_id: 'test-session-id' },
      { type: 'result', subtype: 'success', result: 'done' },
    ]);
    mockedCreateSession.mockReturnValue(defaultSession as any);
    mockedResumeSession.mockReturnValue(defaultSession as any);
  });

  describe('permission mode events', () => {
    it('should emit permission-mode event on init message', async () => {
      const session = createMockSession([
        {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-id',
          permissionMode: 'bypassPermissions',
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const permissionModeHandler = vi.fn();
      sdkSession.on('permission-mode', permissionModeHandler);

      await sdkSession.sendPrompt('Hello');
      await tick();

      expect(permissionModeHandler).toHaveBeenCalledWith('bypassPermissions');
    });

    it('should have default permission mode of default (Ask before edits)', () => {
      expect(sdkSession.getPermissionMode()).toBe('default');
    });

    it('should allow setting permission mode', () => {
      sdkSession.setPermissionMode('plan');
      expect(sdkSession.getPermissionMode()).toBe('plan');
    });

    it('should emit permission-mode event when mode is changed', () => {
      const permissionModeHandler = vi.fn();
      sdkSession.on('permission-mode', permissionModeHandler);

      sdkSession.setPermissionMode('default');

      expect(permissionModeHandler).toHaveBeenCalledWith('default');
    });
  });

  describe('sendPrompt with attachments', () => {
    it('should accept optional ImageAttachment array', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('Describe this image', attachments);

      expect(mockedCreateSession).toHaveBeenCalled();
    });

    it('should send message with image content blocks', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('Describe this image', attachments);

      // Verify send was called with content blocks including image
      expect(session._sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user',
          message: expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'image',
                source: expect.objectContaining({
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: 'base64data',
                }),
              }),
            ]),
          }),
        })
      );
    });

    it('should include base64 source in image content block', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANS' },
      ];

      await sdkSession.sendPrompt('What is this?', attachments);

      expect(session._sendMock).toHaveBeenCalled();
      const sentMessage = session._sendMock.mock.calls[0][0];
      const imageBlock = sentMessage.message.content.find((b: any) => b.type === 'image');
      expect(imageBlock.source.data).toBe('iVBORw0KGgoAAAANS');
      expect(imageBlock.source.media_type).toBe('image/png');
    });

    it('should add text block after images when text provided', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('Describe this image', attachments);

      const sentMessage = session._sendMock.mock.calls[0][0];
      const textBlock = sentMessage.message.content.find((b: any) => b.type === 'text');
      expect(textBlock.text).toBe('Describe this image');
    });

    it('should work with images only (no text)', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('', attachments);

      expect(session._sendMock).toHaveBeenCalled();
    });

    it('should work with text only (no attachments)', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      await sdkSession.sendPrompt('Hello, how are you?');

      expect(session._sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user',
          message: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text', text: 'Hello, how are you?' }),
            ]),
          }),
        })
      );
    });
  });

  describe('getSupportedCommands', () => {
    it('should have getSupportedCommands method', () => {
      expect(typeof sdkSession.getSupportedCommands).toBe('function');
    });

    it('should return Promise<SlashCommand[]>', async () => {
      const result = await sdkSession.getSupportedCommands();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return known Claude Code commands', async () => {
      const result = await sdkSession.getSupportedCommands();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('argumentHint');
    });
  });

  describe('session resumption', () => {
    it('should resume session when sending subsequent messages', async () => {
      // First query to establish session
      const session1 = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-123' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session1 as any);

      await sdkSession.sendPrompt('First message');
      await tick();

      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // For second message, the same session is reused (V2 sessions are persistent)
      // send() is called on the same session object
      await sdkSession.sendPrompt('Second message');

      // With V2, the session is reused, so send should have been called twice
      expect(session1._sendMock).toHaveBeenCalledTimes(2);
    });

    it('should use unstable_v2_resumeSession when resuming a different session', async () => {
      const resumeSession = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'resumed-session-456' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedResumeSession.mockReturnValue(resumeSession as any);

      sdkSession.resumeSession('resumed-session-456');
      await sdkSession.sendPrompt('Continue');

      expect(mockedResumeSession).toHaveBeenCalledWith(
        'resumed-session-456',
        expect.any(Object)
      );
    });
  });

  describe('model switching', () => {
    it('should pass model option when creating session', async () => {
      await sdkSession.sendPrompt('Hello');

      expect(mockedCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
        })
      );
    });

    it('should use opus as the default model', async () => {
      await sdkSession.sendPrompt('Hello');

      expect(mockedCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'opus',
        })
      );
    });

    it('should create new session with updated model after setModel', async () => {
      const session1 = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'session-1' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session1 as any);

      await sdkSession.sendPrompt('Hello');
      await tick();

      // Change model - this closes the session
      await sdkSession.setModel('sonnet');

      // Session should be closed
      expect(session1._closeMock).toHaveBeenCalled();
      expect(sdkSession.getSessionId()).toBeNull();

      // Create new session for next prompt
      const session2 = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'session-2' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session2 as any);

      await sdkSession.sendPrompt('Hello again');

      // New session created with sonnet model
      expect(mockedCreateSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          model: 'sonnet',
        })
      );
    });

    it('should emit model event when model changes', async () => {
      const modelHandler = vi.fn();
      sdkSession.on('model', modelHandler);

      await sdkSession.setModel('sonnet');

      expect(modelHandler).toHaveBeenCalledWith('sonnet');
    });

    it('should return fallback models when no query is active', async () => {
      const models = await sdkSession.getSupportedModels();

      expect(models.length).toBe(3);
      expect(models[0].value).toBe('opus');
      expect(models.map(m => m.value)).toEqual(['opus', 'haiku', 'sonnet']);
    });

    it('should not emit model event when setting same model', async () => {
      const modelHandler = vi.fn();
      sdkSession.on('model', modelHandler);

      await sdkSession.setModel('opus');

      expect(modelHandler).not.toHaveBeenCalled();
    });

    it('should clear sessionId when model changes with no active session', async () => {
      sdkSession.resumeSession('test-session-123');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      await sdkSession.setModel('sonnet');
      expect(sdkSession.getSessionId()).toBeNull();
    });

    it('should prepend conversation context to next prompt after model change clears session', async () => {
      // First: establish a conversation with history
      const session1 = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-123' },
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'I can help with that.' }],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session1 as any);

      await sdkSession.sendPrompt('Help me with code');
      await tick();

      // Change model - closes session
      await sdkSession.setModel('sonnet');
      expect(sdkSession.getSessionId()).toBeNull();

      // Setup new session for next prompt
      const session2 = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'new-session-456' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session2 as any);

      await sdkSession.sendPrompt('Continue helping');

      // Check that send was called with context prefix
      const sentMessage = session2._sendMock.mock.calls[0][0];
      const textBlock = sentMessage.message.content.find((b: any) => b.type === 'text');
      expect(textBlock.text).toContain('[Previous conversation context');
      expect(textBlock.text).toContain('User: Help me with code');
      expect(textBlock.text).toContain('Assistant: I can help with that.');
      expect(textBlock.text).toContain('Continue helping');
    });

    it('should track conversation history', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-123' },
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Hello! How can I help?' }],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      await sdkSession.sendPrompt('Hello');
      await tick();

      const history = sdkSession.getConversationHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    });

    it('should clear conversation history and session ID when clearHistory is called', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-123' },
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Response' }],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      await sdkSession.sendPrompt('Hello');
      await tick();

      expect(sdkSession.getConversationHistory().length).toBe(2);
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      sdkSession.clearHistory();
      expect(sdkSession.getConversationHistory().length).toBe(0);
      expect(sdkSession.getSessionId()).toBeNull();
    });

    it('should not resume session after clearHistory', async () => {
      const session1 = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-123' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session1 as any);

      await sdkSession.sendPrompt('First message');
      await tick();

      expect(sdkSession.getSessionId()).toBe('test-session-123');

      sdkSession.clearHistory();

      // New session should be created (not resumed)
      const session2 = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'new-session-456' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session2 as any);

      await sdkSession.sendPrompt('Second message');

      // Should call createSession, not resumeSession
      expect(mockedCreateSession).toHaveBeenCalledTimes(2);
      expect(mockedResumeSession).not.toHaveBeenCalled();
    });
  });

  describe('thinking mode', () => {
    it('should have thinking mode disabled by default', () => {
      expect(sdkSession.getThinkingMode()).toBe(false);
    });

    it('should allow setting thinking mode', async () => {
      await sdkSession.setThinkingMode(true);
      expect(sdkSession.getThinkingMode()).toBe(true);
    });

    it('should emit thinking-mode event when mode is changed', async () => {
      const thinkingModeHandler = vi.fn();
      sdkSession.on('thinking-mode', thinkingModeHandler);

      await sdkSession.setThinkingMode(true);

      expect(thinkingModeHandler).toHaveBeenCalledWith(true);
    });
  });

  describe('message queuing', () => {
    it('should emit request-queued and queue the message when sendPrompt is called while processing', async () => {
      // Create a session that takes time to finish
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          // Wait before yielding result
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      const queuedHandler = vi.fn();
      sdkSession.on('request-queued', queuedHandler);

      // Start first request (doesn't complete yet)
      const firstPromise = sdkSession.sendPrompt('First message');

      // Wait for first request to start processing
      await tick();

      // Try to send second request while first is processing
      await sdkSession.sendPrompt('Second message');

      // Verify request-queued event was emitted
      expect(queuedHandler).toHaveBeenCalled();

      // Clean up - resolve the slow stream
      if (resolveStream) resolveStream();
      await firstPromise;
      await tick();
    });

    it('should auto-send queued message after first request completes', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      // Start first request
      const firstPromise = sdkSession.sendPrompt('First message');
      await tick();

      // Queue second message while processing
      await sdkSession.sendPrompt('Second message');

      // First request: one send call
      expect(slowSession.send).toHaveBeenCalledTimes(1);

      // Complete the first request
      if (resolveStream) resolveStream();
      await firstPromise;
      await tick();
      await tick();

      // The queued message should have been auto-sent
      expect(slowSession.send).toHaveBeenCalledTimes(2);
    });

    it('should only keep the last queued message (last-one-wins)', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      const firstPromise = sdkSession.sendPrompt('First message');
      await tick();

      // Queue multiple messages - only last should be kept
      await sdkSession.sendPrompt('Second message');
      await sdkSession.sendPrompt('Third message');

      // Complete the first request
      if (resolveStream) resolveStream();
      await firstPromise;
      await tick();
      await tick();

      // The last queued message ('Third message') should be sent
      expect(slowSession.send).toHaveBeenCalledTimes(2);
      const lastSendCall = slowSession.send.mock.calls[1][0];
      const textBlock = lastSendCall.message.content.find((b: any) => b.type === 'text');
      expect(textBlock.text).toBe('Third message');
    });

    it('should not emit request-queued when sendPrompt is called after previous request completes', async () => {
      const queuedHandler = vi.fn();
      sdkSession.on('request-queued', queuedHandler);

      // Send first request and wait for completion
      await sdkSession.sendPrompt('First message');
      await tick();

      // Send second request after first completes
      await sdkSession.sendPrompt('Second message');

      // Verify request-queued was never emitted
      expect(queuedHandler).not.toHaveBeenCalled();
    });

    it('should suppress complete event when queued message exists', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      const completeHandler = vi.fn();
      sdkSession.on('complete', completeHandler);

      const firstPromise = sdkSession.sendPrompt('First message');
      await tick();

      // Queue a message
      await sdkSession.sendPrompt('Second message');

      // Complete the first request
      if (resolveStream) resolveStream();
      await firstPromise;
      await tick();

      // Complete should NOT have been emitted for the first request (suppressed because queued message exists)
      // It will be emitted when the queued message finishes
      expect(completeHandler).not.toHaveBeenCalled();
    });

    it('should clear pending prompt when cancel is called', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        closed: false,
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(() => { slowSession.closed = true; }),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      sdkSession.sendPrompt('First message');
      await tick();

      // Queue a message
      await sdkSession.sendPrompt('Second message');

      // Cancel while processing
      sdkSession.cancel();

      expect(sdkSession.isActive()).toBe(false);

      // Clean up
      if (resolveStream) resolveStream();
      await tick();
    });

    it('should clear pending prompt when clearHistory is called', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        closed: false,
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(() => { slowSession.closed = true; }),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      sdkSession.sendPrompt('First message');
      await tick();

      // Queue a message
      await sdkSession.sendPrompt('Second message');

      // Clear history while processing
      sdkSession.clearHistory();

      expect(sdkSession.isActive()).toBe(false);

      // Clean up
      if (resolveStream) resolveStream();
      await tick();
    });
  });

  describe('isProcessing recovery', () => {
    it('should reset isProcessing when stream ends without result message', async () => {
      // Create a session that yields init but no result, then the stream ends
      // Mark closed=true after stream ends so the while loop exits
      let streamDone = false;
      const noResultSession = {
        get closed() { return streamDone; },
        get sessionId() { return 'no-result-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'no-result-session' };
          // Stream ends without yielding a 'result' message
          streamDone = true;
        },
        close: vi.fn(),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(noResultSession as any);

      const completeHandler = vi.fn();
      sdkSession.on('complete', completeHandler);

      await sdkSession.sendPrompt('Hello');
      // Wait for stream loop to finish
      await tick();
      await tick();

      // isProcessing should be reset by the finally block
      expect(sdkSession.isActive()).toBe(false);
      // complete event should be emitted so UI knows the request finished
      expect(completeHandler).toHaveBeenCalled();
    });

    it('should reset isProcessing when stream loop throws an error', async () => {
      const errorSession = {
        closed: false,
        get sessionId() { return 'error-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'error-session' };
          errorSession.closed = true;
          throw new Error('Stream connection lost');
        },
        close: vi.fn(),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(errorSession as any);

      const errorHandler = vi.fn();
      sdkSession.on('error', errorHandler);

      await sdkSession.sendPrompt('Hello');
      await tick();
      await tick();

      // isProcessing should be reset
      expect(sdkSession.isActive()).toBe(false);
    });

    it('should reset isProcessing when setModel is called during processing', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        closed: false,
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(() => { slowSession.closed = true; }),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      sdkSession.sendPrompt('Hello');
      await tick();

      // Processing should be active
      expect(sdkSession.isActive()).toBe(true);

      // Change model while processing
      await sdkSession.setModel('haiku');

      // isProcessing should be reset
      expect(sdkSession.isActive()).toBe(false);

      // Clean up
      if (resolveStream) resolveStream();
      await tick();
    });

    it('should reset isProcessing when clearHistory is called during processing', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        closed: false,
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(() => { slowSession.closed = true; }),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      sdkSession.sendPrompt('Hello');
      await tick();

      expect(sdkSession.isActive()).toBe(true);

      sdkSession.clearHistory();

      expect(sdkSession.isActive()).toBe(false);

      if (resolveStream) resolveStream();
      await tick();
    });

    it('should reset isProcessing when resumeSession is called during processing', async () => {
      let resolveStream: (() => void) | null = null;
      const slowSession = {
        closed: false,
        get sessionId() { return 'slow-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'slow-session' };
          await new Promise<void>(r => { resolveStream = r; });
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        close: vi.fn(() => { slowSession.closed = true; }),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(slowSession as any);

      sdkSession.sendPrompt('Hello');
      await tick();

      expect(sdkSession.isActive()).toBe(true);

      sdkSession.resumeSession('new-session-id');

      expect(sdkSession.isActive()).toBe(false);

      if (resolveStream) resolveStream();
      await tick();
    });

    it('should allow new requests after isProcessing is recovered', async () => {
      // First: a session that ends without result
      let streamDone = false;
      const noResultSession = {
        get closed() { return streamDone; },
        get sessionId() { return 'no-result-session'; },
        send: vi.fn().mockResolvedValue(undefined),
        stream: async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'no-result-session' };
          streamDone = true;
        },
        close: vi.fn(),
        [Symbol.asyncDispose]: async () => {},
      };
      mockedCreateSession.mockReturnValue(noResultSession as any);

      await sdkSession.sendPrompt('First');
      await tick();
      await tick();

      // Should be recovered
      expect(sdkSession.isActive()).toBe(false);

      // Now a normal session should work
      const normalSession = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'normal-session' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(normalSession as any);

      const queuedHandler = vi.fn();
      sdkSession.on('request-queued', queuedHandler);

      // This needs a fresh session since the old one closed
      sdkSession.clearHistory();
      await sdkSession.sendPrompt('Second');
      await tick();

      // Should NOT be queued (previous request already recovered)
      expect(queuedHandler).not.toHaveBeenCalled();
      expect(normalSession._sendMock).toHaveBeenCalled();
    });
  });

  describe('AskUserQuestion and provideAnswer', () => {
    it('should emit user-question event when canUseTool is called for AskUserQuestion', async () => {
      let capturedCanUseTool: any = null;

      // Capture the canUseTool callback from session creation
      mockedCreateSession.mockImplementation((opts: any) => {
        capturedCanUseTool = opts.canUseTool;
        return createMockSession([
          { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        ]) as any;
      });

      const questionHandler = vi.fn();
      sdkSession.on('user-question', questionHandler);

      // Start a prompt to create the session
      sdkSession.sendPrompt('Help me choose');
      await tick();

      expect(capturedCanUseTool).not.toBeNull();

      // Simulate SDK calling canUseTool for AskUserQuestion
      const canUseToolPromise = capturedCanUseTool('AskUserQuestion', {
        questions: [{
          question: 'Which option?',
          header: 'Choice',
          options: [
            { label: 'Option A', description: 'First option' },
            { label: 'Option B', description: 'Second option' },
          ],
        }],
      }, {
        signal: new AbortController().signal,
        toolUseID: 'toolu_123',
      });

      await tick();

      // user-question event should have been emitted
      expect(questionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          toolUseId: 'toolu_123',
          questions: expect.arrayContaining([
            expect.objectContaining({
              question: 'Which option?',
              header: 'Choice',
            }),
          ]),
        })
      );

      // Resolve the question to avoid hanging
      await sdkSession.provideAnswer('Option A', { '0': 'Option A' });
      await canUseToolPromise;
    });

    it('should resolve canUseTool with updatedInput when provideAnswer is called', async () => {
      let capturedCanUseTool: any = null;

      mockedCreateSession.mockImplementation((opts: any) => {
        capturedCanUseTool = opts.canUseTool;
        return createMockSession([
          { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        ]) as any;
      });

      sdkSession.sendPrompt('Start');
      await tick();

      // Simulate canUseTool being called (this blocks until provideAnswer resolves it)
      const canUseToolPromise = capturedCanUseTool('AskUserQuestion', {
        questions: [{
          question: 'Pick one',
          header: 'Test',
          options: [{ label: 'A', description: 'Option A' }],
        }],
      }, {
        signal: new AbortController().signal,
        toolUseID: 'toolu_456',
      });

      await tick();

      // Provide answer - should resolve the canUseTool promise
      await sdkSession.provideAnswer('Option A', { '0': 'Option A' });

      const result = await canUseToolPromise;
      expect(result.behavior).toBe('allow');
      expect(result.updatedInput).toEqual({
        questions: [{
          question: 'Pick one',
          header: 'Test',
          options: [{ label: 'A', description: 'Option A' }],
        }],
        answers: { '0': 'Option A' },
      });
    });

    it('should track pending question data and clear it after answer', async () => {
      let capturedCanUseTool: any = null;

      mockedCreateSession.mockImplementation((opts: any) => {
        capturedCanUseTool = opts.canUseTool;
        return createMockSession([
          { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        ]) as any;
      });

      sdkSession.sendPrompt('Start');
      await tick();

      // No pending question initially
      expect(sdkSession.getPendingQuestionData()).toBeNull();

      // Simulate canUseTool being called
      const canUseToolPromise = capturedCanUseTool('AskUserQuestion', {
        questions: [{
          question: 'Pick one',
          header: 'Test',
          options: [{ label: 'A', description: 'Option A' }],
        }],
      }, {
        signal: new AbortController().signal,
        toolUseID: 'toolu_789',
      });

      await tick();

      // Pending question should be tracked
      expect(sdkSession.getPendingQuestionData()).toEqual(
        expect.objectContaining({
          toolUseId: 'toolu_789',
          questions: expect.arrayContaining([
            expect.objectContaining({ question: 'Pick one' }),
          ]),
        })
      );

      // Answer the question
      await sdkSession.provideAnswer('A', { '0': 'A' });
      await canUseToolPromise;

      // Pending question should be cleared
      expect(sdkSession.getPendingQuestionData()).toBeNull();
    });

    it('should fall back to sendPrompt when no pending question exists', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      // First complete a normal prompt so isProcessing is false
      await sdkSession.sendPrompt('Hello');
      await tick();

      // Call provideAnswer without a pending question - should fall back
      await sdkSession.provideAnswer('An answer', { result: 'An answer' });

      // send() should have been called twice (initial prompt + fallback)
      expect(session._sendMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('tool-use events', () => {
    it('should emit tool-use event for Edit tool_use blocks', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Edit',
                id: 'toolu_edit_123',
                input: {
                  file_path: '/src/app.ts',
                  old_string: 'const x = 1;',
                  new_string: 'const x = 2;',
                },
              },
            ],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const toolUseHandler = vi.fn();
      sdkSession.on('tool-use', toolUseHandler);

      await sdkSession.sendPrompt('Fix the bug');
      await tick();

      expect(toolUseHandler).toHaveBeenCalledWith({
        action: 'Edit',
        filePath: '/src/app.ts',
        oldString: 'const x = 1;',
        newString: 'const x = 2;',
      });
    });

    it('should emit tool-use event for Write tool_use blocks', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Write',
                id: 'toolu_write_123',
                input: {
                  file_path: '/src/new-file.ts',
                  content: 'export const hello = "world";',
                },
              },
            ],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const toolUseHandler = vi.fn();
      sdkSession.on('tool-use', toolUseHandler);

      await sdkSession.sendPrompt('Create a file');
      await tick();

      expect(toolUseHandler).toHaveBeenCalledWith({
        action: 'Write',
        filePath: '/src/new-file.ts',
        content: 'export const hello = "world";',
      });
    });

    it('should emit generic tool-use event for other tools', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Bash',
                id: 'toolu_bash_123',
                input: {
                  command: 'ls -la',
                },
              },
            ],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const toolUseHandler = vi.fn();
      sdkSession.on('tool-use', toolUseHandler);

      await sdkSession.sendPrompt('List files');
      await tick();

      expect(toolUseHandler).toHaveBeenCalledWith({
        action: 'Bash',
        toolName: 'Bash',
        input: { command: 'ls -la' },
      });
    });

    it('should truncate tool-use content exceeding MAX_TOOL_CONTENT', async () => {
      const longString = 'x'.repeat(15000);
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Edit',
                id: 'toolu_edit_long',
                input: {
                  file_path: '/src/big-file.ts',
                  old_string: longString,
                  new_string: longString,
                },
              },
            ],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const toolUseHandler = vi.fn();
      sdkSession.on('tool-use', toolUseHandler);

      await sdkSession.sendPrompt('Big edit');
      await tick();

      expect(toolUseHandler).toHaveBeenCalledTimes(1);
      const data = toolUseHandler.mock.calls[0][0];
      expect(data.action).toBe('Edit');
      expect(data.oldString.length).toBe(10000);
      expect(data.newString.length).toBe(10000);
    });

    it('should NOT emit tool-use event for AskUserQuestion blocks', async () => {
      const session = createMockSession([
        { type: 'system', subtype: 'init', session_id: 'test-session-id' },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'AskUserQuestion',
                id: 'toolu_ask_123',
                input: {
                  questions: [{ question: 'Which?', header: 'Q', options: [] }],
                },
              },
            ],
          },
        },
        { type: 'result', subtype: 'success', result: 'done' },
      ]);
      mockedCreateSession.mockReturnValue(session as any);

      const toolUseHandler = vi.fn();
      sdkSession.on('tool-use', toolUseHandler);

      await sdkSession.sendPrompt('Help me');
      await tick();

      expect(toolUseHandler).not.toHaveBeenCalled();
    });
  });
});
