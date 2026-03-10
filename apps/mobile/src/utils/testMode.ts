import type {
  UserQuestionData,
  PermissionRequestData,
  RealtimeMessage,
} from 'clautunnel-shared';

/**
 * Returns true when running in Maestro E2E test mode.
 * Requires both __DEV__ and the EXPO_PUBLIC_E2E_TEST_MODE env var.
 */
export function isTestMode(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_E2E_TEST_MODE === 'true';
}

// ---------------------------------------------------------------------------
// Mock auth data
// ---------------------------------------------------------------------------

export const MOCK_USER = {
  id: 'test-user-id',
  email: 'test@clautunnel.com',
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
