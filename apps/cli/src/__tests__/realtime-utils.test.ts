import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribeWithTimeout } from '../realtime/utils.js';

describe('subscribeWithTimeout', () => {
  let mockChannel: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockChannel = {
      subscribe: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve true on SUBSCRIBED status', async () => {
    mockChannel.subscribe.mockImplementation((cb: Function) => {
      cb('SUBSCRIBED');
    });

    const result = await subscribeWithTimeout(mockChannel, 'test-channel');

    expect(result).toBe(true);
  });

  it('should resolve false on CHANNEL_ERROR status', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockChannel.subscribe.mockImplementation((cb: Function) => {
      cb('CHANNEL_ERROR', new Error('test error'));
    });

    const result = await subscribeWithTimeout(mockChannel, 'test-channel');

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should resolve false on CLOSED status', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockChannel.subscribe.mockImplementation((cb: Function) => {
      cb('CLOSED');
    });

    const result = await subscribeWithTimeout(mockChannel, 'test-channel');

    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('should resolve false on TIMED_OUT status', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockChannel.subscribe.mockImplementation((cb: Function) => {
      cb('TIMED_OUT');
    });

    const result = await subscribeWithTimeout(mockChannel, 'test-channel');

    expect(result).toBe(false);
    warnSpy.mockRestore();
  });

  it('should resolve false after timeout if no status received', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // subscribe callback is never called
    mockChannel.subscribe.mockImplementation(() => {});

    const promise = subscribeWithTimeout(mockChannel, 'test-channel');

    vi.advanceTimersByTime(10000);

    const result = await promise;

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('timeout')
    );
    warnSpy.mockRestore();
  });

  it('should use custom timeout when provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockChannel.subscribe.mockImplementation(() => {});

    const promise = subscribeWithTimeout(mockChannel, 'test-channel', 5000);

    vi.advanceTimersByTime(4999);
    // Should not have resolved yet

    vi.advanceTimersByTime(1);

    const result = await promise;
    expect(result).toBe(false);
    warnSpy.mockRestore();
  });
});

import { afterEach } from 'vitest';
