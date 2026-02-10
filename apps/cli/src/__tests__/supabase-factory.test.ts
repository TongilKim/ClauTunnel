import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ mock: true })),
}));

import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../utils/supabase.js';

describe('createSupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a basic Supabase client', () => {
    const client = createSupabaseClient('https://test.supabase.co', 'anon-key');

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'anon-key',
      undefined
    );
    expect(client).toEqual({ mock: true });
  });

  it('should create a client with realtime options when requested', () => {
    const client = createSupabaseClient('https://test.supabase.co', 'anon-key', {
      realtime: true,
    });

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'anon-key',
      {
        realtime: {
          params: { eventsPerSecond: 10 },
          timeout: 30000,
        },
      }
    );
    expect(client).toEqual({ mock: true });
  });

  it('should create a basic client when realtime is false', () => {
    const client = createSupabaseClient('https://test.supabase.co', 'anon-key', {
      realtime: false,
    });

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'anon-key',
      undefined
    );
  });
});
