import { describe, it, expect } from 'vitest';
import {
  // Message types
  type MessageType,
  type Message,
  type RealtimeMessageType,
  type RealtimeMessage,
  type ImageAttachment,
  type PermissionMode,
  type SlashCommand,
  // Session types
  type SessionStatus,
  type Session,
  // Machine types
  type MachineStatus,
  type Machine,
  // Presence types
  type PresencePayload,
} from '../index';

describe('Message Types', () => {
  describe('MessageType', () => {
    it('should include output, input, error, system', () => {
      const validTypes: MessageType[] = ['output', 'input', 'error', 'system'];
      validTypes.forEach((type) => {
        const msg: { type: MessageType } = { type };
        expect(msg.type).toBe(type);
      });
    });
  });

  describe('Message interface', () => {
    it('should have required fields (id, session_id, type, content, created_at)', () => {
      const message: Message = {
        id: 1,
        session_id: 'session-123',
        type: 'output',
        content: 'Hello world',
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(message.id).toBe(1);
      expect(message.session_id).toBe('session-123');
      expect(message.type).toBe('output');
      expect(message.content).toBe('Hello world');
      expect(message.created_at).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('RealtimeMessage interface', () => {
    it('should have required fields (type, content, timestamp, seq)', () => {
      const message: RealtimeMessage = {
        type: 'output',
        content: 'test content',
        timestamp: 1704067200000,
        seq: 0,
      };

      expect(message.type).toBe('output');
      expect(message.content).toBe('test content');
      expect(message.timestamp).toBe(1704067200000);
      expect(message.seq).toBe(0);
    });

    it('should include all core message types', () => {
      const validTypes: RealtimeMessageType[] = [
        'output',
        'input',
        'error',
        'system',
      ];
      validTypes.forEach((type) => {
        const msg: RealtimeMessage = { type, timestamp: 0, seq: 0 };
        expect(msg.type).toBe(type);
      });
    });

    it('should include mode message type', () => {
      const modeMessage: RealtimeMessage = {
        type: 'mode',
        timestamp: Date.now(),
        seq: 3,
      };

      expect(modeMessage.type).toBe('mode');

      // Verify 'mode' is valid in the union
      const validTypes: RealtimeMessageType[] = [
        'output',
        'input',
        'error',
        'system',
        'mode',
      ];
      expect(validTypes).toContain('mode');
    });

    it('should include permissionMode field for mode messages', () => {
      const modeMessage: RealtimeMessage = {
        type: 'mode',
        permissionMode: 'default',
        timestamp: Date.now(),
        seq: 4,
      };

      expect(modeMessage.type).toBe('mode');
      expect(modeMessage.permissionMode).toBe('default');

      // Test all valid permission modes
      const validModes: PermissionMode[] = [
        'default',
        'acceptEdits',
        'plan',
        'bypassPermissions',
        'delegate',
        'dontAsk',
      ];
      validModes.forEach((mode) => {
        const msg: RealtimeMessage = {
          type: 'mode',
          permissionMode: mode,
          timestamp: Date.now(),
          seq: 5,
        };
        expect(msg.permissionMode).toBe(mode);
      });
    });

    it('should have optional attachments field', () => {
      // Message without attachments
      const messageWithoutAttachments: RealtimeMessage = {
        type: 'input',
        content: 'Hello',
        timestamp: Date.now(),
        seq: 1,
      };
      expect(messageWithoutAttachments.attachments).toBeUndefined();

      // Message with attachments
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];
      const messageWithAttachments: RealtimeMessage = {
        type: 'input',
        content: 'Describe this image',
        attachments,
        timestamp: Date.now(),
        seq: 2,
      };
      expect(messageWithAttachments.attachments).toBe(attachments);
      expect(messageWithAttachments.attachments?.length).toBe(1);
    });
  });
});

describe('Session Types', () => {
  describe('SessionStatus', () => {
    it('should include active, paused, ended', () => {
      const validStatuses: SessionStatus[] = ['active', 'paused', 'ended'];
      validStatuses.forEach((status) => {
        const session: { status: SessionStatus } = { status };
        expect(session.status).toBe(status);
      });
    });
  });

  describe('Session interface', () => {
    it('should have required fields (id, machine_id, status, started_at)', () => {
      const session: Session = {
        id: 'session-123',
        machine_id: 'machine-456',
        status: 'active',
        started_at: '2024-01-01T00:00:00Z',
      };

      expect(session.id).toBe('session-123');
      expect(session.machine_id).toBe('machine-456');
      expect(session.status).toBe('active');
      expect(session.started_at).toBe('2024-01-01T00:00:00Z');
    });

    it('should have optional fields (working_directory, ended_at)', () => {
      // Session without optional fields
      const minimalSession: Session = {
        id: 'session-123',
        machine_id: 'machine-456',
        status: 'active',
        started_at: '2024-01-01T00:00:00Z',
      };
      expect(minimalSession.working_directory).toBeUndefined();
      expect(minimalSession.ended_at).toBeUndefined();

      // Session with optional fields
      const fullSession: Session = {
        id: 'session-123',
        machine_id: 'machine-456',
        status: 'ended',
        started_at: '2024-01-01T00:00:00Z',
        working_directory: '/home/user/project',
        ended_at: '2024-01-01T01:00:00Z',
      };
      expect(fullSession.working_directory).toBe('/home/user/project');
      expect(fullSession.ended_at).toBe('2024-01-01T01:00:00Z');
    });

    it('should have undefined title when not set', () => {
      const session: Session = {
        id: 'session-123',
        machine_id: 'machine-456',
        status: 'active',
        started_at: '2024-01-01T00:00:00Z',
      };
      expect(session.title).toBeUndefined();
    });

    it('should return set value when title is provided', () => {
      const session: Session = {
        id: 'session-123',
        machine_id: 'machine-456',
        status: 'active',
        started_at: '2024-01-01T00:00:00Z',
        title: 'My Custom Session',
      };
      expect(session.title).toBe('My Custom Session');
    });
  });
});

describe('ImageAttachment Types', () => {
  describe('ImageAttachment interface', () => {
    it('should have type field set to image', () => {
      const attachment: ImageAttachment = {
        type: 'image',
        mediaType: 'image/jpeg',
        data: 'base64encodeddata',
      };

      expect(attachment.type).toBe('image');
    });

    it('should have mediaType field with valid image MIME types', () => {
      const validMediaTypes: Array<ImageAttachment['mediaType']> = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ];

      validMediaTypes.forEach((mediaType) => {
        const attachment: ImageAttachment = {
          type: 'image',
          mediaType,
          data: 'base64data',
        };
        expect(attachment.mediaType).toBe(mediaType);
      });
    });

    it('should have data field for base64 string', () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const attachment: ImageAttachment = {
        type: 'image',
        mediaType: 'image/png',
        data: base64Data,
      };

      expect(attachment.data).toBe(base64Data);
      expect(typeof attachment.data).toBe('string');
    });
  });
});

describe('Permission Mode Types', () => {
  describe('PermissionMode', () => {
    it('should include all valid modes', () => {
      const validModes: PermissionMode[] = [
        'default',
        'acceptEdits',
        'plan',
        'bypassPermissions',
        'delegate',
        'dontAsk',
      ];
      validModes.forEach((mode) => {
        const obj: { mode: PermissionMode } = { mode };
        expect(obj.mode).toBe(mode);
      });
    });
  });
});

describe('SlashCommand Types', () => {
  describe('SlashCommand interface', () => {
    it('should have name, description, argumentHint fields', () => {
      const command: SlashCommand = {
        name: 'commit',
        description: 'Commit changes to git',
        argumentHint: '<message>',
      };

      expect(command.name).toBe('commit');
      expect(command.description).toBe('Commit changes to git');
      expect(command.argumentHint).toBe('<message>');
    });
  });

  describe('RealtimeMessageType for commands', () => {
    it('should include commands and commands-request types', () => {
      const validTypes: RealtimeMessageType[] = [
        'commands',
        'commands-request',
      ];

      validTypes.forEach((type) => {
        const msg: { type: RealtimeMessageType } = { type };
        expect(msg.type).toBe(type);
      });
    });

    it('should include commands field for commands message type', () => {
      const commands: SlashCommand[] = [
        { name: 'commit', description: 'Commit changes', argumentHint: '<message>' },
        { name: 'help', description: 'Show help', argumentHint: '' },
      ];

      const commandsMessage: RealtimeMessage = {
        type: 'commands',
        commands,
        timestamp: Date.now(),
        seq: 0,
      };

      expect(commandsMessage.type).toBe('commands');
      expect(commandsMessage.commands).toBe(commands);
      expect(commandsMessage.commands?.length).toBe(2);
    });
  });
});

describe('Machine Types', () => {
  describe('MachineStatus', () => {
    it('should include online, offline', () => {
      const validStatuses: MachineStatus[] = ['online', 'offline'];
      validStatuses.forEach((status) => {
        const machine: { status: MachineStatus } = { status };
        expect(machine.status).toBe(status);
      });
    });
  });

  describe('Machine interface', () => {
    it('should have required fields (id, user_id, name, status, created_at)', () => {
      const machine: Machine = {
        id: 'machine-123',
        user_id: 'user-456',
        name: 'My MacBook',
        status: 'online',
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(machine.id).toBe('machine-123');
      expect(machine.user_id).toBe('user-456');
      expect(machine.name).toBe('My MacBook');
      expect(machine.status).toBe('online');
      expect(machine.created_at).toBe('2024-01-01T00:00:00Z');
    });

    it('should have optional fields (hostname, last_seen_at)', () => {
      // Machine without optional fields
      const minimalMachine: Machine = {
        id: 'machine-123',
        user_id: 'user-456',
        name: 'My MacBook',
        status: 'online',
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(minimalMachine.hostname).toBeUndefined();
      expect(minimalMachine.last_seen_at).toBeUndefined();

      // Machine with optional fields
      const fullMachine: Machine = {
        id: 'machine-123',
        user_id: 'user-456',
        name: 'My MacBook',
        hostname: 'macbook-pro.local',
        last_seen_at: '2024-01-01T00:30:00Z',
        status: 'online',
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(fullMachine.hostname).toBe('macbook-pro.local');
      expect(fullMachine.last_seen_at).toBe('2024-01-01T00:30:00Z');
    });
  });
});

describe('Presence Types', () => {
  describe('PresencePayload interface', () => {
    it('should have type field for cli or mobile', () => {
      const cliPresence: PresencePayload = {
        type: 'cli',
        online_at: '2024-01-01T00:00:00Z',
      };

      const mobilePresence: PresencePayload = {
        type: 'mobile',
        online_at: '2024-01-01T00:00:00Z',
      };

      expect(cliPresence.type).toBe('cli');
      expect(mobilePresence.type).toBe('mobile');
    });

    it('should have online_at field', () => {
      const presence: PresencePayload = {
        type: 'cli',
        online_at: '2024-01-01T00:00:00Z',
      };

      expect(presence.online_at).toBe('2024-01-01T00:00:00Z');
    });
  });
});
