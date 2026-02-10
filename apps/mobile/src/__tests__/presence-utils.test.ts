import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPresenceHandlers } from '../utils/presenceUtils';

describe('setupPresenceHandlers', () => {
  let mockChannel: any;
  let handlers: Record<string, Function>;

  beforeEach(() => {
    handlers = {};
    mockChannel = {
      on: vi.fn((type: string, opts: any, handler: Function) => {
        handlers[opts.event] = handler;
        return mockChannel;
      }),
      presenceState: vi.fn(() => ({})),
    };
  });

  it('should register sync, join, and leave handlers', () => {
    const onStatusChange = vi.fn();
    setupPresenceHandlers(mockChannel, 'entity-1', onStatusChange);

    expect(mockChannel.on).toHaveBeenCalledTimes(3);
    expect(handlers['sync']).toBeDefined();
    expect(handlers['join']).toBeDefined();
    expect(handlers['leave']).toBeDefined();
  });

  it('should call onStatusChange with isOnline=true when CLI is present on sync', () => {
    const onStatusChange = vi.fn();
    setupPresenceHandlers(mockChannel, 'entity-1', onStatusChange);

    mockChannel.presenceState.mockReturnValue({
      'user1': [{ type: 'cli', online_at: '2024-01-01' }],
    });

    handlers['sync']();

    expect(onStatusChange).toHaveBeenCalledWith('entity-1', true, expect.any(Array));
  });

  it('should call onStatusChange with isOnline=false when no CLI present on sync', () => {
    const onStatusChange = vi.fn();
    setupPresenceHandlers(mockChannel, 'entity-1', onStatusChange);

    mockChannel.presenceState.mockReturnValue({
      'user1': [{ type: 'mobile', online_at: '2024-01-01' }],
    });

    handlers['sync']();

    expect(onStatusChange).toHaveBeenCalledWith('entity-1', false, expect.any(Array));
  });

  it('should call onStatusChange with isOnline=true on CLI join', () => {
    const onStatusChange = vi.fn();
    setupPresenceHandlers(mockChannel, 'entity-1', onStatusChange);

    handlers['join']({
      newPresences: [{ type: 'cli', online_at: '2024-01-01' }],
    });

    expect(onStatusChange).toHaveBeenCalledWith('entity-1', true, []);
  });

  it('should not call onStatusChange on non-CLI join', () => {
    const onStatusChange = vi.fn();
    setupPresenceHandlers(mockChannel, 'entity-1', onStatusChange);

    handlers['join']({
      newPresences: [{ type: 'mobile', online_at: '2024-01-01' }],
    });

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('should recheck presence state on CLI leave', () => {
    const onStatusChange = vi.fn();
    setupPresenceHandlers(mockChannel, 'entity-1', onStatusChange);

    // No CLI present after leave
    mockChannel.presenceState.mockReturnValue({});

    handlers['leave']({
      leftPresences: [{ type: 'cli', online_at: '2024-01-01' }],
    });

    expect(onStatusChange).toHaveBeenCalledWith('entity-1', false, expect.any(Array));
  });

  it('should not call onStatusChange on non-CLI leave', () => {
    const onStatusChange = vi.fn();
    setupPresenceHandlers(mockChannel, 'entity-1', onStatusChange);

    handlers['leave']({
      leftPresences: [{ type: 'mobile', online_at: '2024-01-01' }],
    });

    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
