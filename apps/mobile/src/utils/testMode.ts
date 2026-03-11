import type {
  ModelInfo,
  PermissionMode,
  SlashCommand,
  UserQuestionData,
  PermissionRequestData,
  RealtimeMessage,
} from 'clautunnel-shared';

/**
 * Returns true when running in Maestro E2E test mode.
 * The EXPO_PUBLIC_E2E_TEST_MODE env var is baked in at build time and only
 * set in CI / local E2E builds — production App Store builds never set it.
 */
export function isTestMode(): boolean {
  return process.env.EXPO_PUBLIC_E2E_TEST_MODE === 'true';
}

// ---------------------------------------------------------------------------
// Mock auth data
// ---------------------------------------------------------------------------

export const MOCK_USER = {
  id: 'test-user-id',
  email: 'test@clautunnel.com',
} as const;

export const MOCK_TEST_CREDENTIALS = {
  email: MOCK_USER.email,
  password: 'password123',
} as const;

export const MOCK_SESSION = {
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  user: MOCK_USER,
} as const;

// ---------------------------------------------------------------------------
// Mock machines & sessions
// ---------------------------------------------------------------------------

export const MOCK_MACHINES = [
  {
    id: 'test-machine-1',
    name: 'Test MacBook',
    hostname: 'test-macbook.local',
    user_id: 'test-user-id',
    status: 'online' as const,
    created_at: new Date().toISOString(),
  },
];

export const MOCK_RESUME_SDK_SESSION_ID = 'mock-sdk-session-ended-1';

export const MOCK_SESSIONS = [
  {
    id: 'test-session-1',
    machine_id: 'test-machine-1',
    status: 'active' as const,
    title: 'Test Session',
    working_directory: '/Users/test/project',
    started_at: new Date().toISOString(),
    machines: {
      id: 'test-machine-1',
      name: 'Test MacBook',
      hostname: 'test-macbook.local',
      status: 'online' as const,
    },
  },
  {
    id: 'test-session-2',
    machine_id: 'test-machine-1',
    status: 'ended' as const,
    title: 'Ended Session',
    sdk_session_id: MOCK_RESUME_SDK_SESSION_ID,
    model: 'sonnet',
    working_directory: '/Users/test/old-project',
    started_at: new Date(Date.now() - 3600000).toISOString(),
    ended_at: new Date().toISOString(),
    machines: {
      id: 'test-machine-1',
      name: 'Test MacBook',
      hostname: 'test-macbook.local',
      status: 'online' as const,
    },
  },
];

export function buildMockSessions() {
  return MOCK_SESSIONS.map((session) => ({
    ...session,
    machines: session.machines ? { ...session.machines } : undefined,
  }));
}

export function buildMockMachines() {
  return MOCK_MACHINES.map((machine) => ({ ...machine }));
}

export function buildMockMessages() {
  return MOCK_MESSAGES.map((message) => ({ ...message }));
}

export function buildMockStartedSession(index: number) {
  return {
    id: `test-session-${index}`,
    machine_id: 'test-machine-1',
    status: 'active' as const,
    title: `Test Session ${index}`,
    sdk_session_id: `mock-sdk-session-${index}`,
    model: 'opus',
    working_directory: `/Users/test/project-${index}`,
    started_at: new Date().toISOString(),
    machines: {
      id: 'test-machine-1',
      name: 'Test MacBook',
      hostname: 'test-macbook.local',
      status: 'online' as const,
    },
  };
}

export const MOCK_MODELS: ModelInfo[] = [
  {
    value: 'opus',
    displayName: 'Opus 4.6',
    description: 'Best quality for complex reasoning',
  },
  {
    value: 'sonnet',
    displayName: 'Sonnet 4',
    description: 'Fast, balanced default model',
  },
  {
    value: 'haiku',
    displayName: 'Haiku 3.5',
    description: 'Fastest model for lightweight work',
  },
];

export const MOCK_COMMANDS: SlashCommand[] = [
  {
    name: 'model',
    description: 'Change the Claude model for this session',
    argumentHint: '[model]',
  },
  {
    name: 'clear',
    description: 'Clear the current conversation context',
    argumentHint: '',
  },
  {
    name: 'resume',
    description: 'Resume a previous SDK session',
    argumentHint: '[session-id]',
  },
];

export const MOCK_PERMISSION_MODE: PermissionMode = 'default';

// ---------------------------------------------------------------------------
// Mock interactive data
// ---------------------------------------------------------------------------

export const MOCK_QUESTION_DATA: UserQuestionData = {
  toolUseId: 'test-tool-use-1',
  questions: [
    {
      question: 'Which testing framework should we use?',
      header: 'TEST_FRAMEWORK',
      options: [
        { label: 'Maestro', description: 'YAML-based mobile E2E testing' },
        { label: 'Detox', description: 'React Native E2E by Wix' },
        { label: 'Appium', description: 'Cross-platform automation' },
      ],
    },
  ],
};

export const MOCK_PERMISSION_REQUEST: PermissionRequestData = {
  requestId: 'test-perm-1',
  toolName: 'Bash',
  toolInput: { command: 'npm test' },
  toolUseId: 'test-tool-use-2',
  decisionReason: 'Running shell command requires permission',
};

// ---------------------------------------------------------------------------
// Mock messages for terminal display
// ---------------------------------------------------------------------------

export const MOCK_MESSAGES: RealtimeMessage[] = [
  {
    type: 'input',
    content: 'Hello Claude!',
    timestamp: Date.now() - 5000,
    seq: 1,
  },
  {
    type: 'output',
    content: 'Hello! How can I help you today?',
    timestamp: Date.now() - 3000,
    seq: 2,
  },
  {
    type: 'input',
    content: 'Can you help me with testing?',
    timestamp: Date.now() - 1000,
    seq: 3,
  },
];

export function buildMockClaudeResponse(input: string): string {
  return `Mock response to: ${input.trim()}`;
}

export function buildMockAnswerSummary(answers: Record<string, string>): string {
  const values = Object.values(answers).filter(Boolean);
  return values.length > 0 ? values.join(', ') : 'No answer provided';
}

export function buildMockPermissionSummary(
  toolName: string,
  behavior: 'allow' | 'deny',
): string {
  const decision = behavior === 'allow' ? 'allowed' : 'denied';
  return `Permission ${decision} for ${toolName}`;
}
