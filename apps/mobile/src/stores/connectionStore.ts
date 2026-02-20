import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  RealtimeMessage,
  ImageAttachment,
  ModelInfo,
  PermissionMode,
  SlashCommand,
  InteractiveCommandType,
  InteractiveCommandData,
  InteractiveApplyPayload,
  InteractiveResult,
  UserQuestionData,
  UserAnswerData,
  PermissionRequestData,
  PermissionResponseData,
} from 'termbridge-shared';
import { REALTIME_CHANNELS } from 'termbridge-shared';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface ConnectionStoreState {
  state: ConnectionState;
  sessionId: string | null;
  messages: RealtimeMessage[];
  lastSeq: number;
  error: string | null;
  isTyping: boolean;
  isMessageQueued: boolean;
  isCliOnline: boolean | null; // Tracks if CLI is online via Supabase Presence (null = not yet checked)
  permissionMode: PermissionMode | null;
  commands: SlashCommand[];
  model: string | null;
  availableModels: ModelInfo[];
  isModelChanging: boolean;

  // Interactive command state
  interactiveData: InteractiveCommandData | null;
  isInteractiveLoading: boolean;
  interactiveError: string | null;

  // User question state (from AskUserQuestion tool)
  pendingQuestion: UserQuestionData | null;

  // Permission request state (from SDK canUseTool callback)
  pendingPermissionRequest: PermissionRequestData | null;

  // Actions
  connect: (sessionId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendInput: (content: string, attachments?: ImageAttachment[]) => Promise<void>;
  sendModeChange: (mode: PermissionMode) => Promise<void>;
  sendModelChange: (model: string) => Promise<void>;
  requestCommands: () => Promise<void>;
  requestModels: () => Promise<void>;
  requestPendingState: () => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  sendClearRequest: () => Promise<void>;
  sendResumeRequest: (sdkSessionId: string) => Promise<void>;

  // Interactive actions
  requestInteractiveCommand: (command: InteractiveCommandType) => Promise<void>;
  applyInteractiveChange: (payload: InteractiveApplyPayload) => Promise<void>;
  clearInteractive: () => void;

  // User question actions
  sendUserAnswer: (answers: Record<string, string>) => Promise<void>;
  clearPendingQuestion: () => void;

  // Permission request actions
  sendPermissionResponse: (behavior: 'allow' | 'deny', message?: string) => Promise<void>;
  clearPendingPermissionRequest: () => void;

  // Scroll callback for chat UI
  registerScrollToBottom: (callback: () => void) => void;
  scrollToBottom: () => void;
}

let outputChannel: RealtimeChannel | null = null;
let inputChannel: RealtimeChannel | null = null;
let seq = 0;
let scrollToBottomCallback: (() => void) | null = null;

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  state: 'disconnected',
  sessionId: null,
  messages: [],
  lastSeq: 0,
  error: null,
  isTyping: false,
  isMessageQueued: false,
  isCliOnline: null, // null = not yet checked
  permissionMode: null,
  commands: [],
  model: null,
  availableModels: [],
  isModelChanging: false,
  interactiveData: null,
  isInteractiveLoading: false,
  interactiveError: null,
  pendingQuestion: null,
  pendingPermissionRequest: null,

  connect: async (sessionId: string) => {
    try {
      // Clear all previous session state - each session has its own messages, typing state, model, commands, etc.
      set({
        state: 'connecting',
        sessionId,
        error: null,
        messages: [],
        lastSeq: 0,
        isTyping: false,
        isMessageQueued: false,
        isCliOnline: null, // Reset to unknown until presence syncs
        permissionMode: null,
        commands: [],
        model: null,
        availableModels: [],
        isModelChanging: false,
        interactiveData: null,
        isInteractiveLoading: false,
        interactiveError: null,
        pendingQuestion: null,
        pendingPermissionRequest: null,
      });

      // First check if the session is still active
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        throw new Error('Failed to fetch session status');
      }

      if (session.status !== 'active') {
        set({ state: 'disconnected', error: null });
        return;
      }

      // Fetch message history from database
      const { data: historicalMessages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('seq', { ascending: true });

      if (!messagesError && historicalMessages && historicalMessages.length > 0) {
        const messages: RealtimeMessage[] = historicalMessages.map((msg) => ({
          type: msg.type as RealtimeMessage['type'],
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
          seq: msg.seq,
        }));
        const lastSeq = historicalMessages[historicalMessages.length - 1].seq;
        // Initialize seq counter to continue from where historical messages left off
        seq = lastSeq;
        set({ messages, lastSeq });
      } else {
        // Reset seq counter for new session with no history
        seq = 0;
      }

      // Clean up existing channels
      if (outputChannel) {
        await supabase.removeChannel(outputChannel);
      }
      if (inputChannel) {
        await supabase.removeChannel(inputChannel);
      }

      // Subscribe to output channel
      const outputChannelName = REALTIME_CHANNELS.sessionOutput(sessionId);
      outputChannel = supabase.channel(outputChannelName);

      outputChannel.on('broadcast', { event: 'output' }, (payload) => {
        const message = payload.payload as RealtimeMessage;

        // Handle request-queued - message was queued because Claude is still processing
        if (message.type === 'request-queued') {
          set({ isMessageQueued: true });
          return;
        }

        // Handle error messages - reset isTyping and show error
        if (message.type === 'error') {
          set({
            isTyping: false,
            isMessageQueued: false,
            error: message.content || 'An error occurred'
          });
          return;
        }

        // Handle mode messages separately
        if (message.type === 'mode' && message.permissionMode) {
          set({ permissionMode: message.permissionMode });
          return;
        }

        // Handle commands messages separately
        if (message.type === 'commands' && message.commands) {
          set({ commands: message.commands });
          return;
        }

        // Handle model messages separately
        if (message.type === 'model' && message.model) {
          set({ model: message.model, isModelChanging: false });
          return;
        }

        // Handle available models list
        if (message.type === 'models' && message.availableModels) {
          set({ availableModels: message.availableModels });
          return;
        }

        // Handle interactive response
        if (message.type === 'interactive-response' && message.interactiveData) {
          set({
            interactiveData: message.interactiveData,
            isInteractiveLoading: false,
            interactiveError: null,
          });
          return;
        }

        // Handle interactive confirm
        if (message.type === 'interactive-confirm') {
          // The result is in the message, we can clear interactive state
          // The system message will show the result
          if (message.interactiveResult && !message.interactiveResult.success) {
            set({ interactiveError: message.interactiveResult.message || 'Failed to apply change' });
          } else {
            set({ interactiveData: null, interactiveError: null });
          }
          return;
        }

        // Handle user question from AskUserQuestion tool
        if (message.type === 'user-question' && message.userQuestion) {
          set({ pendingQuestion: message.userQuestion, isTyping: false });
          return;
        }

        // Handle permission request from SDK canUseTool callback
        if (message.type === 'permission-request' && message.permissionRequest) {
          set({ pendingPermissionRequest: message.permissionRequest, isTyping: false });
          return;
        }

        // Handle session-title - auto-generated from first user message
        // Update the session store so the header title reflects immediately.
        if (message.type === 'session-title' && message.sessionTitle) {
          const { useSessionStore } = require('./sessionStore');
          const sessionId = get().sessionId;
          if (sessionId) {
            useSessionStore.setState((state: { sessions: Array<{ id: string; title?: string }> }) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId
                  ? { ...s, title: message.sessionTitle }
                  : s
              ),
            }));
          }
          return;
        }

        // Handle complete - Claude has finished responding
        if (message.type === 'complete') {
          set({ isTyping: false, isMessageQueued: false });
          return;
        }

        // Handle resume-history - load messages from a previous session
        if (message.type === 'resume-history' && message.historySessionId) {
          // Fetch messages from the resumed session and prepend to current messages
          supabase
            .from('messages')
            .select('*')
            .eq('session_id', message.historySessionId)
            .order('seq', { ascending: true })
            .then(({ data: historicalMessages, error }) => {
              if (!error && historicalMessages && historicalMessages.length > 0) {
                const resumedMessages: RealtimeMessage[] = historicalMessages.map((msg) => ({
                  type: msg.type as RealtimeMessage['type'],
                  content: msg.content,
                  timestamp: new Date(msg.created_at).getTime(),
                  seq: msg.seq,
                }));
                // Prepend resumed messages to current messages
                set((state) => ({
                  messages: [...resumedMessages, ...state.messages],
                }));
              }
            });
          return;
        }

        set((state) => {
          // Skip duplicate messages (already loaded from history)
          // Only check duplicates within the same message type to avoid
          // mobile seq colliding with CLI seq
          const isDuplicate = state.messages.some(
            (m) => m.seq === message.seq && m.type === message.type
          );
          if (isDuplicate) {
            return {};
          }
          return {
            messages: [...state.messages, message],
            lastSeq: message.seq,
          };
        });
      });

      // Subscribe to input channel (for sending)
      const inputChannelName = REALTIME_CHANNELS.sessionInput(sessionId);
      inputChannel = supabase.channel(inputChannelName);

      // Wait for subscriptions
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          outputChannel!.subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
            else if (status === 'CHANNEL_ERROR') reject(new Error('Output channel error'));
          });
        }),
        new Promise<void>((resolve, reject) => {
          inputChannel!.subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
            else if (status === 'CHANNEL_ERROR') reject(new Error('Input channel error'));
          });
        }),
      ]);

      set({ state: 'connected' });

      // Request available commands, models, and any pending state from CLI
      get().requestCommands();
      get().requestModels();
      get().requestPendingState();
    } catch (error) {
      set({
        state: 'disconnected',
        error: error instanceof Error ? error.message : 'Failed to connect',
      });
    }
  },

  disconnect: async () => {
    if (outputChannel) {
      await supabase.removeChannel(outputChannel);
      outputChannel = null;
    }
    if (inputChannel) {
      await supabase.removeChannel(inputChannel);
      inputChannel = null;
    }

    set({
      state: 'disconnected',
      sessionId: null,
      isCliOnline: false,
    });
  },

  sendInput: async (content: string, attachments?: ImageAttachment[]) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const sessionId = get().sessionId;
    const message: RealtimeMessage = {
      type: 'input',
      content,
      attachments,
      timestamp: Date.now(),
      seq: ++seq,
    };

    // Add input message to local state so it appears in chat
    // Set isTyping to true while waiting for Claude's response
    set((state) => ({
      messages: [...state.messages, message],
      isTyping: true,
    }));

    // Scroll to bottom after the message is rendered
    // Use setTimeout to ensure React has time to render the new message
    setTimeout(() => {
      get().scrollToBottom();
    }, 50);

    // Persist input message to database for history
    if (sessionId) {
      supabase.from('messages').insert({
        session_id: sessionId,
        type: message.type,
        content: message.content,
        seq: message.seq,
      }).then(() => {}).catch(() => {
        // Silent fail - persistence is secondary
      });
    }

    try {
      await inputChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: message,
      });
    } catch {
      set({ error: 'Failed to send message' });
    }
  },

  clearMessages: () => {
    set({ messages: [], lastSeq: 0 });
  },

  sendClearRequest: async () => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'clear-request',
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  sendResumeRequest: async (sdkSessionId: string) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    // Set typing indicator while resuming
    set({ isTyping: true });

    const message: RealtimeMessage = {
      type: 'resume-request',
      resumeSessionId: sdkSessionId,
      timestamp: Date.now(),
      seq: ++seq,
    };

    try {
      await inputChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: message,
      });
    } catch {
      set({ error: 'Failed to send resume request', isTyping: false });
    }
  },

  sendModeChange: async (mode: PermissionMode) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'mode-change',
      permissionMode: mode,
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  requestCommands: async () => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'commands-request',
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  sendModelChange: async (model: string) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    // Set loading state
    set({ isModelChanging: true });

    const message: RealtimeMessage = {
      type: 'model-change',
      model,
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  requestModels: async () => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'models-request',
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  requestPendingState: async () => {
    if (!inputChannel || get().state !== 'connected') {
      return;
    }

    const message: RealtimeMessage = {
      type: 'status-request',
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  clearError: () => set({ error: null }),

  requestInteractiveCommand: async (command: InteractiveCommandType) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ interactiveError: 'Not connected' });
      return;
    }

    set({ isInteractiveLoading: true, interactiveError: null });

    const message: RealtimeMessage = {
      type: 'interactive-request',
      interactiveCommand: command,
      timestamp: Date.now(),
      seq: ++seq,
    };

    try {
      await inputChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: message,
      });
    } catch {
      set({ isInteractiveLoading: false, interactiveError: 'Failed to send request' });
    }
  },

  applyInteractiveChange: async (payload: InteractiveApplyPayload) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ interactiveError: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'interactive-apply',
      interactivePayload: payload,
      timestamp: Date.now(),
      seq: ++seq,
    };

    try {
      await inputChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: message,
      });
    } catch {
      set({ interactiveError: 'Failed to apply change' });
    }
  },

  clearInteractive: () => set({
    interactiveData: null,
    isInteractiveLoading: false,
    interactiveError: null,
  }),

  sendUserAnswer: async (answers: Record<string, string>) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const pendingQuestion = get().pendingQuestion;
    if (!pendingQuestion) {
      return;
    }

    const userAnswer: UserAnswerData = {
      toolUseId: pendingQuestion.toolUseId,
      answers,
    };

    const message: RealtimeMessage = {
      type: 'user-answer',
      userAnswer,
      timestamp: Date.now(),
      seq: ++seq,
    };

    // Clear the pending question
    set({ pendingQuestion: null, isTyping: true });

    try {
      await inputChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: message,
      });
    } catch {
      set({ error: 'Failed to send answer', isTyping: false });
    }
  },

  clearPendingQuestion: () => set({ pendingQuestion: null }),

  sendPermissionResponse: async (behavior: 'allow' | 'deny', message?: string) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const pendingRequest = get().pendingPermissionRequest;
    if (!pendingRequest) {
      return;
    }

    const permissionResponse: PermissionResponseData = {
      requestId: pendingRequest.requestId,
      behavior,
      message,
    };

    const realtimeMessage: RealtimeMessage = {
      type: 'permission-response',
      permissionResponse,
      timestamp: Date.now(),
      seq: ++seq,
    };

    // Clear the pending request
    set({ pendingPermissionRequest: null, isTyping: true });

    try {
      await inputChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: realtimeMessage,
      });
    } catch {
      set({ error: 'Failed to send permission response', isTyping: false });
    }
  },

  clearPendingPermissionRequest: () => set({ pendingPermissionRequest: null }),

  registerScrollToBottom: (callback: () => void) => {
    scrollToBottomCallback = callback;
  },

  scrollToBottom: () => {
    if (scrollToBottomCallback) {
      scrollToBottomCallback();
    }
  },
}));
