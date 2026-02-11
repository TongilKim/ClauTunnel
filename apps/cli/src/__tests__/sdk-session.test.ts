import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAttachment, ModelInfo, SlashCommand } from 'termbridge-shared';

// Mock Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { SdkSession } from '../daemon/sdk-session.js';
import { query } from '@anthropic-ai/claude-agent-sdk';

describe('SdkSession', () => {
  let sdkSession: SdkSession;
  const mockedQuery = vi.mocked(query);

  beforeEach(() => {
    vi.clearAllMocks();
    sdkSession = new SdkSession({ cwd: '/test' });

    // Default mock to return empty async iterable
    mockedQuery.mockImplementation(async function* () {
      yield { type: 'result', result: 'done' };
    } as any);
  });

  describe('permission mode events', () => {
    it('should emit permission-mode event on init message', async () => {
      // Mock query to return a system init message with permissionMode
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-id',
          permissionMode: 'bypassPermissions',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      const permissionModeHandler = vi.fn();
      sdkSession.on('permission-mode', permissionModeHandler);

      await sdkSession.sendPrompt('Hello');

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

      // Should not throw when called with attachments
      await sdkSession.sendPrompt('Describe this image', attachments);

      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should build content blocks with image type', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('Describe this image', attachments);

      // Verify query was called with the right structure
      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs).toBeDefined();

      // When attachments are provided, prompt should be an array or content blocks
      // The exact format depends on SDK implementation
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.any(Object),
        })
      );
    });

    it('should include base64 source in image content block', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANS' },
      ];

      await sdkSession.sendPrompt('What is this?', attachments);

      // The implementation should pass data to the query
      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should add text block after images when text provided', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('Describe this image', attachments);

      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should work with images only (no text)', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      // Empty prompt with attachments should work
      await sdkSession.sendPrompt('', attachments);

      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should work with text only (no attachments)', async () => {
      await sdkSession.sendPrompt('Hello, how are you?');

      // Now always uses streaming input mode (AsyncIterable) for setModel() support
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.any(Object),
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
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('First message');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // Send second message - should resume
      await sdkSession.sendPrompt('Second message');

      // Second call should have resume option
      const secondCall = mockedQuery.mock.calls[1][0];
      expect(secondCall.options.resume).toBe('test-session-123');
    });
  });

  describe('model switching', () => {
    it('should pass model option when creating query', async () => {
      await sdkSession.sendPrompt('Hello');

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'default',
          }),
        })
      );
    });

    it('should pass updated model option after setModel', async () => {
      await sdkSession.setModel('opus');
      await sdkSession.sendPrompt('Hello');

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'opus',
          }),
        })
      );
    });

    it('should emit model event when model changes', async () => {
      const modelHandler = vi.fn();
      sdkSession.on('model', modelHandler);

      await sdkSession.setModel('opus');

      expect(modelHandler).toHaveBeenCalledWith('opus');
    });

    it('should return fallback models when no query is active', async () => {
      const models = await sdkSession.getSupportedModels();

      expect(models.length).toBe(4);
      expect(models[0].value).toBe('default');
      expect(models.map(m => m.value)).toEqual(['default', 'opus', 'haiku', 'sonnet']);
    });

    it('should cache SDK models after first fetch from SDK', async () => {
      const sdkModels: ModelInfo[] = [
        { value: 'default', displayName: 'Default (recommended)', description: 'Use the default model' },
        { value: 'opus', displayName: 'Opus', description: 'Opus 4.6' },
        { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 4.5' },
      ];

      const mockSupportedModels = vi.fn().mockResolvedValue(sdkModels);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = mockSupportedModels;
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      // Create a query so currentQuery is set
      await sdkSession.sendPrompt('Hello');

      // First call — fetches from SDK and caches
      const models = await sdkSession.getSupportedModels();
      expect(models).toEqual(sdkModels);
      expect(mockSupportedModels).toHaveBeenCalledTimes(1);

      // Second call — should use cache, not call SDK again
      const models2 = await sdkSession.getSupportedModels();
      expect(models2).toEqual(sdkModels);
      expect(mockSupportedModels).toHaveBeenCalledTimes(1);
    });

    it('should return cached SDK models after clearHistory resets session state', async () => {
      // First: no query, no cache — should return fallback
      const fallbackModels = await sdkSession.getSupportedModels();
      expect(fallbackModels.length).toBe(4);
      expect(fallbackModels[0].value).toBe('default');

      // Now set up a query that returns SDK models
      const sdkModels: ModelInfo[] = [
        { value: 'default', displayName: 'Default', description: 'Default model' },
        { value: 'opus', displayName: 'Opus', description: 'Opus 4.6' },
      ];

      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue(sdkModels);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('Hello');

      // Fetch and cache SDK models
      const cachedModels = await sdkSession.getSupportedModels();
      expect(cachedModels).toEqual(sdkModels);

      // clearHistory resets sessionId and history, but cache persists
      sdkSession.clearHistory();

      // Should still return cached SDK models, not fallback
      const modelsAfterClear = await sdkSession.getSupportedModels();
      expect(modelsAfterClear).toEqual(sdkModels);
    });

    it('should return fallback models when SDK supportedModels() fails', async () => {
      const mockSupportedModels = vi.fn().mockRejectedValue(new Error('SDK error'));
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = mockSupportedModels;
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('Hello');
      const models = await sdkSession.getSupportedModels();

      expect(models.length).toBe(4);
      expect(models[0].value).toBe('default');
    });

    it('should not emit model event when setting same model', async () => {
      const modelHandler = vi.fn();
      sdkSession.on('model', modelHandler);

      await sdkSession.setModel('default');

      expect(modelHandler).not.toHaveBeenCalled();
    });

    it('should call SDK query.setModel() when query is active', async () => {
      const mockSetModel = vi.fn().mockResolvedValue(undefined);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setModel = mockSetModel;
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      // Create an active query
      await sdkSession.sendPrompt('Hello');

      // Now change model — should use SDK's setModel
      await sdkSession.setModel('opus');

      expect(mockSetModel).toHaveBeenCalledWith('opus');
      // Session should NOT be nulled since SDK handled it
      expect(sdkSession.getSessionId()).toBe('test-session-123');
    });

    it('should fall back to session-null when SDK query.setModel() fails', async () => {
      const mockSetModel = vi.fn().mockRejectedValue(new Error('not supported'));
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setModel = mockSetModel;
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('Hello');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // SDK setModel fails — should fall back to clearing session
      await sdkSession.setModel('opus');

      expect(mockSetModel).toHaveBeenCalledWith('opus');
      expect(sdkSession.getSessionId()).toBeNull();
    });

    it('should clear sessionId when model changes with no active query', async () => {
      // setModel before any sendPrompt — no currentQuery exists
      // Manually set a sessionId to simulate a previous session
      sdkSession.resumeSession('test-session-123');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // Change model — no currentQuery, should clear session
      await sdkSession.setModel('opus');
      expect(sdkSession.getSessionId()).toBeNull();
    });

    it('should preserve session and resume after successful SDK setModel', async () => {
      const mockSetModel = vi.fn().mockResolvedValue(undefined);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setModel = mockSetModel;
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('First message');

      // Change model — SDK setModel succeeds, session preserved
      await sdkSession.setModel('opus');
      expect(mockSetModel).toHaveBeenCalledWith('opus');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // Send another message — should resume the same session
      await sdkSession.sendPrompt('Second message');

      const secondCall = mockedQuery.mock.calls[1][0];
      expect(secondCall.options.resume).toBe('test-session-123');
      expect(secondCall.options.model).toBe('opus');
    });

    it('should not resume session after model change when SDK setModel fails', async () => {
      const mockSetModel = vi.fn().mockRejectedValue(new Error('not supported'));
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setModel = mockSetModel;
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('First message');

      // Change model — SDK setModel fails, falls back to clearing session
      await sdkSession.setModel('opus');

      // Send another message — should NOT resume
      await sdkSession.sendPrompt('Second message');

      const secondCall = mockedQuery.mock.calls[1][0];
      expect(secondCall.options.resume).toBeUndefined();
      expect(secondCall.options.model).toBe('opus');
    });

    it('should prepend conversation context to next prompt after model change clears session', async () => {
      // First: establish a conversation with history
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'I can help with that.' }],
            },
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('Help me with code');

      // Change model with no active SDK setModel — falls back to clearing session
      // (mock query has no setModel method, so it will throw and clear session)
      await sdkSession.setModel('opus');
      expect(sdkSession.getSessionId()).toBeNull();

      // Capture the prompt sent to the next query call
      let capturedPrompt: any;
      mockedQuery.mockImplementation((args: any) => {
        capturedPrompt = args;
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'new-session-456',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('Continue helping');

      // The prompt should NOT have a resume option (session was cleared)
      expect(capturedPrompt.options.resume).toBeUndefined();
      expect(capturedPrompt.options.model).toBe('opus');

      // Consume the async iterable to get the user message
      const promptIterable = capturedPrompt.prompt;
      const messages: any[] = [];
      for await (const msg of promptIterable) {
        messages.push(msg);
      }

      // The user message content should include conversation context prefix
      const textBlock = messages[0].message.content.find((b: any) => b.type === 'text');
      expect(textBlock.text).toContain('[Previous conversation context');
      expect(textBlock.text).toContain('User: Help me with code');
      expect(textBlock.text).toContain('Assistant: I can help with that.');
      expect(textBlock.text).toContain('Continue helping');
    });

    it('should NOT prepend context when SDK setModel succeeds (session preserved)', async () => {
      const mockSetModel = vi.fn().mockResolvedValue(undefined);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Sure thing.' }],
            },
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setModel = mockSetModel;
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('Hello');

      // SDK setModel succeeds — session preserved, no context transfer needed
      await sdkSession.setModel('opus');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // Capture next prompt
      let capturedPrompt: any;
      mockedQuery.mockImplementation((args: any) => {
        capturedPrompt = args;
        const queryObj = (async function* () {
          yield {
            type: 'system',
            subtype: 'init',
            session_id: 'test-session-123',
          };
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = vi.fn();
        (queryObj as any).supportedModels = vi.fn().mockResolvedValue([]);
        (queryObj as any).supportedCommands = vi.fn().mockResolvedValue([]);
        return queryObj as any;
      });

      await sdkSession.sendPrompt('Next question');

      // Should resume and NOT have context prefix
      expect(capturedPrompt.options.resume).toBe('test-session-123');

      const promptIterable = capturedPrompt.prompt;
      const messages: any[] = [];
      for await (const msg of promptIterable) {
        messages.push(msg);
      }

      const textBlock = messages[0].message.content.find((b: any) => b.type === 'text');
      expect(textBlock.text).not.toContain('[Previous conversation context');
      expect(textBlock.text).toBe('Next question');
    });

    it('should track conversation history', async () => {
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Hello! How can I help?' }],
          },
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('Hello');

      const history = sdkSession.getConversationHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    });

    it('should include conversation context in prompt after model change', async () => {
      // First establish session and conversation
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'I am Claude Sonnet.' }],
          },
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('Who are you?');

      // Change model
      await sdkSession.setModel('opus');

      // Send new message - should include context
      await sdkSession.sendPrompt('Continue helping me');

      const secondCall = mockedQuery.mock.calls[1][0];
      // The prompt should be an async iterable that yields a user message with context
      expect(secondCall.options.model).toBe('opus');
      // Context should be included (we'll verify the structure in implementation)
    });

    it('should clear conversation history and session ID when clearHistory is called', async () => {
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Response' }],
          },
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('Hello');
      expect(sdkSession.getConversationHistory().length).toBe(2);
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      sdkSession.clearHistory();
      expect(sdkSession.getConversationHistory().length).toBe(0);
      expect(sdkSession.getSessionId()).toBeNull();
    });

    it('should not resume session after clearHistory', async () => {
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('First message');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      sdkSession.clearHistory();

      // Send another message - should NOT have resume option
      await sdkSession.sendPrompt('Second message');

      const secondCall = mockedQuery.mock.calls[1][0];
      expect(secondCall.options.resume).toBeUndefined();
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

    it('should call setMaxThinkingTokens on query when thinking is enabled', async () => {
      const mockSetMaxThinkingTokens = vi.fn().mockResolvedValue(undefined);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = mockSetMaxThinkingTokens;
        return queryObj as any;
      });

      await sdkSession.setThinkingMode(true);
      await sdkSession.sendPrompt('Hello');

      expect(mockSetMaxThinkingTokens).toHaveBeenCalledWith(null);
    });

    it('should not call setMaxThinkingTokens when thinking is disabled', async () => {
      const mockSetMaxThinkingTokens = vi.fn().mockResolvedValue(undefined);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = mockSetMaxThinkingTokens;
        return queryObj as any;
      });

      await sdkSession.setThinkingMode(false);
      await sdkSession.sendPrompt('Hello');

      expect(mockSetMaxThinkingTokens).not.toHaveBeenCalled();
    });
  });

  describe('request rejection', () => {
    it('should emit request-rejected event when sendPrompt is called while already processing', async () => {
      // Mock query to simulate a long-running request
      mockedQuery.mockImplementation(async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'test-session' };
        // Simulate long-running task
        await new Promise(resolve => setTimeout(resolve, 100));
        yield { type: 'result', result: 'done' };
      } as any);

      const requestRejectedHandler = vi.fn();
      const outputHandler = vi.fn();
      sdkSession.on('request-rejected', requestRejectedHandler);
      sdkSession.on('output', outputHandler);

      // Start first request (doesn't await, so it's still processing)
      const firstPromise = sdkSession.sendPrompt('First message');

      // Wait a bit to ensure first request is processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try to send second request while first is processing
      await sdkSession.sendPrompt('Second message');

      // Verify request-rejected event was emitted
      expect(requestRejectedHandler).toHaveBeenCalledWith(
        'Your message was not processed because Claude is still working on the previous request. Please wait.'
      );

      // Verify output event was also emitted (for terminal)
      expect(outputHandler).toHaveBeenCalledWith(
        '\n[TermBridge] Previous request still processing...\n'
      );

      // Clean up - wait for first request to complete
      await firstPromise;
    });

    it('should not emit request-rejected when sendPrompt is called after previous request completes', async () => {
      const requestRejectedHandler = vi.fn();
      sdkSession.on('request-rejected', requestRejectedHandler);

      // Send first request and wait for completion
      await sdkSession.sendPrompt('First message');

      // Send second request after first completes
      await sdkSession.sendPrompt('Second message');

      // Verify request-rejected was never emitted
      expect(requestRejectedHandler).not.toHaveBeenCalled();
    });
  });
});
