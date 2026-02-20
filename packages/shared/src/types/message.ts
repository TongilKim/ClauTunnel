export type MessageType = 'output' | 'input' | 'error' | 'system' | 'tool-use';

export type PermissionMode =
  | 'default' // Ask before making changes
  | 'acceptEdits' // Auto-approve file edits
  | 'plan' // Plan mode (read-only, no execution)
  | 'bypassPermissions' // Yolo mode (bypass all prompts)
  // Legacy/internal modes - kept for SDK compatibility
  | 'delegate' // Used when sub-agents are running
  | 'dontAsk'; // Internal mode for certain SDK contexts

export interface Message {
  id: number;
  session_id: string;
  type: MessageType;
  content: string;
  created_at: string;
}

export type RealtimeMessageType =
  | 'output'
  | 'input'
  | 'error'
  | 'system'
  | 'mode'
  | 'mode-change'
  | 'commands'
  | 'commands-request'
  | 'model'
  | 'model-change'
  | 'models'
  | 'models-request'
  | 'mobile-disconnect'
  | 'interactive-request'
  | 'interactive-response'
  | 'interactive-apply'
  | 'interactive-confirm'
  | 'clear-request' // Request to clear conversation (doesn't appear in chat)
  | 'resume-request' // Request to resume a different session (doesn't appear in chat)
  | 'resume-history' // Tells mobile to load messages from a previous session
  | 'user-question' // Claude is asking the user a question with options
  | 'user-answer' // User's answer to a question
  | 'permission-request' // SDK is asking for tool permission
  | 'permission-response' // User's response to permission request
  | 'request-queued' // Message was queued because Claude is still processing
  | 'status-request' // Mobile requests current pending state (question/permission)
  | 'session-title' // Session title was auto-generated from first user message
  | 'tool-use' // Tool use data for displaying diffs (Edit, Write, etc.)
  | 'complete'; // Claude has finished responding (query complete)

export type InteractiveCommandType =
  | 'config'
  | 'permissions'
  | 'allowed-tools'
  | 'vim'
  | 'mcp'
  | 'agents'
  | 'hooks';

export type InteractiveUIType =
  | 'select'
  | 'toggle'
  | 'multi-select'
  | 'nested';

export interface InteractiveOption {
  id: string;
  label: string;
  description?: string;
  value: unknown;
  selected?: boolean;
  children?: InteractiveOption[];
}

export interface InteractiveCommandData {
  command: InteractiveCommandType;
  uiType: InteractiveUIType;
  title: string;
  description?: string;
  options: InteractiveOption[];
  currentValue?: unknown;
}

export interface InteractiveApplyPayload {
  command: InteractiveCommandType;
  action: 'set' | 'add' | 'remove' | 'toggle';
  key?: string;
  value: unknown;
}

export interface InteractiveResult {
  success: boolean;
  message?: string;
}

export interface RealtimeMessage {
  type: RealtimeMessageType;
  content?: string;
  attachments?: ImageAttachment[];
  permissionMode?: PermissionMode;
  commands?: SlashCommand[];
  model?: string;
  availableModels?: ModelInfo[];
  interactiveCommand?: InteractiveCommandType;
  interactiveData?: InteractiveCommandData;
  interactivePayload?: InteractiveApplyPayload;
  interactiveResult?: InteractiveResult;
  resumeSessionId?: string; // SDK session ID for resume-request
  historySessionId?: string; // Supabase session ID to load messages from (for resume-history)
  sessionTitle?: string; // Auto-generated session title from first user message
  userQuestion?: UserQuestionData; // For user-question type
  userAnswer?: UserAnswerData; // For user-answer type
  permissionRequest?: PermissionRequestData; // For permission-request type
  permissionResponse?: PermissionResponseData; // For permission-response type
  errorCode?: string; // For error type messages (e.g., 'timeout')
  toolUseData?: ToolUseData; // For tool-use type messages (diffs, file operations)
  timestamp: number;
  seq: number;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

export interface ImageAttachment {
  type: 'image';
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

// User question types (for AskUserQuestion tool)
export interface UserQuestionOption {
  label: string;
  description: string;
}

export interface UserQuestion {
  question: string;
  header: string;
  options: UserQuestionOption[];
  multiSelect?: boolean;
}

export interface UserQuestionData {
  toolUseId: string;
  questions: UserQuestion[];
}

export interface UserAnswerData {
  toolUseId: string;
  answers: Record<string, string>; // question index -> selected option label or custom text
}

// Permission request types (for SDK canUseTool callback)
export type PermissionBehavior = 'allow' | 'deny' | 'ask';

export interface PermissionRuleValue {
  toolName: string;
  ruleContent?: string;
}

export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg';

export type PermissionUpdate =
  | {
      type: 'addRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'replaceRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'removeRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'setMode';
      mode: PermissionMode;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'addDirectories';
      directories: string[];
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'removeDirectories';
      directories: string[];
      destination: PermissionUpdateDestination;
    };

export interface PermissionRequestData {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: string;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  agentId?: string;
}

export interface PermissionResponseData {
  requestId: string;
  behavior: 'allow' | 'deny';
  message?: string; // For deny - reason message
  updatedInput?: Record<string, unknown>; // For allow - modified input
  updatedPermissions?: PermissionUpdate[]; // For allow - permission updates
}

// Tool use types for displaying diffs and file operations in mobile UI
export interface ToolUseEditData {
  action: 'Edit';
  filePath: string;
  oldString: string;
  newString: string;
}

export interface ToolUseWriteData {
  action: 'Write';
  filePath: string;
  content: string;
}

export interface ToolUseGenericData {
  action: string;
  toolName: string;
  input: Record<string, unknown>;
}

export type ToolUseData = ToolUseEditData | ToolUseWriteData | ToolUseGenericData;

// Machine-level command types (for listen mode)
export type MachineCommandType =
  | 'start-session'
  | 'session-started'
  | 'session-ended'
  | 'start-session-error'
  | 'stop-session';

export interface MachineCommand {
  type: MachineCommandType;
  sessionId?: string;
  workingDirectory?: string;
  error?: string;
  timestamp: number;
}
