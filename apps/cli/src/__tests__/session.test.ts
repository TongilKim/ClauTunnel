import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../daemon/session.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('SessionManager', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let sessionManager: SessionManager;

  const mockSession = {
    id: 'session-123',
    machine_id: 'machine-456',
    status: 'active',
    working_directory: '/home/user',
    started_at: '2024-01-01T00:00:00Z',
    ended_at: null,
  };

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
          }),
        }),
      }),
    };

    sessionManager = new SessionManager({
      supabase: mockSupabase as SupabaseClient,
    });
  });

  it('should create session with machine ID', async () => {
    const session = await sessionManager.createSession(
      'machine-456',
      '/home/user'
    );

    expect(session).toBeDefined();
    expect(session.machine_id).toBe('machine-456');
    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
  });

  it('should create session with working directory', async () => {
    const session = await sessionManager.createSession(
      'machine-456',
      '/home/user/project'
    );

    expect(session).toBeDefined();
  });

  it('should set session status to active on creation', async () => {
    const session = await sessionManager.createSession('machine-456');

    expect(session.status).toBe('active');
  });

  it('should end session by ID', async () => {
    await sessionManager.endSession('session-123');

    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
  });

  it('should update ended_at timestamp when ending session', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      update: updateMock,
    });

    await sessionManager.endSession('session-123');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ended',
        ended_at: expect.any(String),
      })
    );
  });

  it('should get session by ID', async () => {
    const session = await sessionManager.getSession('session-123');

    expect(session).toBeDefined();
    expect(session?.id).toBe('session-123');
  });

  it('should return null for non-existent session', async () => {
    mockSupabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'Not found' },
          }),
        }),
      }),
    });

    sessionManager = new SessionManager({
      supabase: mockSupabase as SupabaseClient,
    });

    const session = await sessionManager.getSession('non-existent');

    expect(session).toBeNull();
  });

  it('should update session status', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      update: updateMock,
    });

    await sessionManager.updateSessionStatus('session-123', 'paused');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paused',
      })
    );
  });

  it('should throw error on database failure', async () => {
    mockSupabase.from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      }),
    });

    sessionManager = new SessionManager({
      supabase: mockSupabase as SupabaseClient,
    });

    await expect(
      sessionManager.createSession('machine-456')
    ).rejects.toThrow('Failed to create session');
  });

  it('should update session model', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      update: updateMock,
    });

    await sessionManager.updateSessionModel('session-123', 'opus');

    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
    expect(updateMock).toHaveBeenCalledWith({ model: 'opus' });
  });

  it('should throw error on model update failure', async () => {
    mockSupabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: { message: 'Database error' },
        }),
      }),
    });

    sessionManager = new SessionManager({
      supabase: mockSupabase as SupabaseClient,
    });

    await expect(
      sessionManager.updateSessionModel('session-123', 'opus')
    ).rejects.toThrow('Failed to update session model');
  });

  it('should update session title', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      update: updateMock,
    });

    await sessionManager.updateSessionTitle('session-123', 'Help me refactor auth');

    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
    expect(updateMock).toHaveBeenCalledWith({ title: 'Help me refactor auth' });
  });
});
