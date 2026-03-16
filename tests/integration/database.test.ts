import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment gate – skip the entire suite when credentials are absent
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_LOCAL_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const canRunDbTests = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY && SUPABASE_ANON_KEY);

const describeDb = canRunDbTests ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Supabase client authenticated as a specific user (subject to RLS). */
async function createUserClient(
  serviceClient: SupabaseClient,
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  // Create the user via admin API (service role)
  const { data: userData, error: createErr } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createErr) throw createErr;
  const userId = userData.user.id;

  // Sign in to obtain an access token, then build a client with that JWT
  const anonClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data: signInData, error: signInErr } =
    await anonClient.auth.signInWithPassword({ email, password });

  if (signInErr) throw signInErr;

  const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${signInData.session!.access_token}`,
      },
    },
  });

  return { client: userClient, userId };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('Database Integration', () => {
  let serviceClient: SupabaseClient;

  // Test users – created once, cleaned up in afterAll
  let userA: { client: SupabaseClient; userId: string };
  let userB: { client: SupabaseClient; userId: string };

  const testUserAEmail = `test-db-a-${Date.now()}@clautunnel-test.local`;
  const testUserBEmail = `test-db-b-${Date.now()}@clautunnel-test.local`;
  const testPassword = 'Test_Password_12345!';

  // Track IDs created during each test so afterEach can clean up
  const createdMachineIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdPushTokenIds: string[] = [];
  const createdPairingIds: string[] = [];

  // -----------------------------------------------------------------------
  // Setup / Teardown
  // -----------------------------------------------------------------------

  beforeAll(async () => {
    serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
    userA = await createUserClient(serviceClient, testUserAEmail, testPassword);
    userB = await createUserClient(serviceClient, testUserBEmail, testPassword);
  }, 30_000);

  afterEach(async () => {
    // Clean up in reverse dependency order using service client (bypasses RLS)
    for (const id of createdPushTokenIds) {
      await serviceClient.from('push_tokens').delete().eq('id', id);
    }
    createdPushTokenIds.length = 0;

    for (const id of createdPairingIds) {
      await serviceClient.from('mobile_pairings').delete().eq('id', id);
    }
    createdPairingIds.length = 0;

    // Deleting machines cascades to sessions and messages
    for (const id of createdMachineIds) {
      await serviceClient.from('machines').delete().eq('id', id);
    }
    createdMachineIds.length = 0;

    // In case sessions were created without a tracked machine
    for (const id of createdSessionIds) {
      await serviceClient.from('sessions').delete().eq('id', id);
    }
    createdSessionIds.length = 0;
  });

  afterAll(async () => {
    // Remove test users
    if (userA?.userId) {
      await serviceClient.auth.admin.deleteUser(userA.userId);
    }
    if (userB?.userId) {
      await serviceClient.auth.admin.deleteUser(userB.userId);
    }
  }, 15_000);

  // -----------------------------------------------------------------------
  // Helpers to insert test records via service client (bypasses RLS)
  // -----------------------------------------------------------------------

  async function insertMachine(
    overrides: Record<string, unknown> = {},
  ) {
    const defaults = {
      user_id: userA.userId,
      name: 'test-machine',
      hostname: null,
      status: 'offline',
    };
    const row = { ...defaults, ...overrides };
    const { data, error } = await serviceClient
      .from('machines')
      .insert(row)
      .select()
      .single();
    if (data) createdMachineIds.push(data.id);
    return { data, error };
  }

  async function insertSession(
    machineId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const defaults = {
      machine_id: machineId,
      status: 'active',
    };
    const row = { ...defaults, ...overrides };
    const { data, error } = await serviceClient
      .from('sessions')
      .insert(row)
      .select()
      .single();
    if (data) createdSessionIds.push(data.id);
    return { data, error };
  }

  async function insertMessage(
    sessionId: string,
    seq: number,
    overrides: Record<string, unknown> = {},
  ) {
    const defaults = {
      session_id: sessionId,
      type: 'output',
      content: `msg-${seq}`,
      seq,
    };
    const row = { ...defaults, ...overrides };
    const { data, error } = await serviceClient
      .from('messages')
      .insert(row)
      .select()
      .single();
    return { data, error };
  }

  async function insertPushToken(
    overrides: Record<string, unknown> = {},
  ) {
    const defaults = {
      user_id: userA.userId,
      token: `ExponentPushToken[test-${Date.now()}-${Math.random()}]`,
      device_name: 'test-device',
    };
    const row = { ...defaults, ...overrides };
    const { data, error } = await serviceClient
      .from('push_tokens')
      .insert(row)
      .select()
      .single();
    if (data) createdPushTokenIds.push(data.id);
    return { data, error };
  }

  // -----------------------------------------------------------------------
  // Schema Constraints
  // -----------------------------------------------------------------------

  describe('Schema Constraints', () => {
    it('rejects invalid machine status', async () => {
      const { error } = await insertMachine({ status: 'invalid' });
      expect(error).not.toBeNull();
    });

    it('accepts all valid machine statuses: online, offline', async () => {
      for (const status of ['online', 'offline']) {
        const { data, error } = await insertMachine({
          status,
          name: `machine-${status}`,
          hostname: `host-${status}-${Date.now()}`,
        });
        expect(error).toBeNull();
        expect(data).not.toBeNull();
      }
    });

    it('rejects invalid session status', async () => {
      const { data: machine } = await insertMachine();
      const { error } = await insertSession(machine!.id, { status: 'running' });
      expect(error).not.toBeNull();
    });

    it('accepts all valid session statuses: active, paused, ended', async () => {
      const { data: machine } = await insertMachine();
      for (const status of ['active', 'paused', 'ended']) {
        const { data, error } = await insertSession(machine!.id, { status });
        expect(error).toBeNull();
        expect(data).not.toBeNull();
      }
    });

    it('rejects invalid message type', async () => {
      const { data: machine } = await insertMachine();
      const { data: session } = await insertSession(machine!.id);
      const { error } = await insertMessage(session!.id, 1, { type: 'log' });
      expect(error).not.toBeNull();
    });

    it('accepts all valid message types including tool-use', async () => {
      const { data: machine } = await insertMachine();
      const { data: session } = await insertSession(machine!.id);
      let seq = 1;
      for (const type of ['output', 'input', 'error', 'system', 'tool-use']) {
        const { data, error } = await insertMessage(session!.id, seq++, { type });
        expect(error).toBeNull();
        expect(data).not.toBeNull();
      }
    });

    it('requires machine_id on sessions (NOT NULL)', async () => {
      const { error } = await serviceClient
        .from('sessions')
        .insert({ status: 'active' })
        .select()
        .single();
      expect(error).not.toBeNull();
    });

    it('requires session_id on messages (NOT NULL)', async () => {
      const { error } = await serviceClient
        .from('messages')
        .insert({ type: 'output', content: 'hello', seq: 1 })
        .select()
        .single();
      expect(error).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Cascade Deletes
  // -----------------------------------------------------------------------

  describe('Cascade Deletes', () => {
    it('deletes sessions when machine is deleted', async () => {
      const { data: machine } = await insertMachine();
      const { data: s1 } = await insertSession(machine!.id);
      const { data: s2 } = await insertSession(machine!.id);

      // Act: delete the machine
      await serviceClient.from('machines').delete().eq('id', machine!.id);
      // Remove from tracked list since we already deleted it
      const idx = createdMachineIds.indexOf(machine!.id);
      if (idx !== -1) createdMachineIds.splice(idx, 1);

      // Assert: sessions are gone
      const { data: remaining } = await serviceClient
        .from('sessions')
        .select('id')
        .in('id', [s1!.id, s2!.id]);
      expect(remaining).toHaveLength(0);
    });

    it('deletes messages when session is deleted', async () => {
      const { data: machine } = await insertMachine();
      const { data: session } = await insertSession(machine!.id);
      const { data: m1 } = await insertMessage(session!.id, 1);
      const { data: m2 } = await insertMessage(session!.id, 2);
      const { data: m3 } = await insertMessage(session!.id, 3);

      // Act: delete the session
      await serviceClient.from('sessions').delete().eq('id', session!.id);
      const sIdx = createdSessionIds.indexOf(session!.id);
      if (sIdx !== -1) createdSessionIds.splice(sIdx, 1);

      // Assert: messages are gone
      const { data: remaining } = await serviceClient
        .from('messages')
        .select('id')
        .in('id', [m1!.id, m2!.id, m3!.id]);
      expect(remaining).toHaveLength(0);
    });

    it('cascades through machine -> sessions -> messages', async () => {
      const { data: machine } = await insertMachine();
      const { data: session } = await insertSession(machine!.id);
      const { data: msg } = await insertMessage(session!.id, 1);

      // Act: delete machine (top of chain)
      await serviceClient.from('machines').delete().eq('id', machine!.id);
      const idx = createdMachineIds.indexOf(machine!.id);
      if (idx !== -1) createdMachineIds.splice(idx, 1);

      // Assert: session gone
      const { data: sessions } = await serviceClient
        .from('sessions')
        .select('id')
        .eq('id', session!.id);
      expect(sessions).toHaveLength(0);

      // Assert: message gone
      const { data: messages } = await serviceClient
        .from('messages')
        .select('id')
        .eq('id', msg!.id);
      expect(messages).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // RLS Policies
  // -----------------------------------------------------------------------

  describe('RLS Policies', () => {
    it('user can only see their own machines', async () => {
      // Arrange: create machines for each user via service client
      await insertMachine({ user_id: userA.userId, name: 'A-machine' });
      await insertMachine({ user_id: userB.userId, name: 'B-machine' });

      // Act: userB queries machines
      const { data: bMachines } = await userB.client.from('machines').select('*');

      // Assert: userB should NOT see userA's machine
      const names = (bMachines ?? []).map((m: any) => m.name);
      expect(names).toContain('B-machine');
      expect(names).not.toContain('A-machine');
    });

    it('user cannot insert machines with another user_id', async () => {
      // Act: userA tries to insert a machine owned by userB
      const { data, error } = await userA.client
        .from('machines')
        .insert({ user_id: userB.userId, name: 'sneaky-machine' })
        .select()
        .single();

      // Assert: either an error or zero rows returned
      const failed = error !== null || data === null;
      expect(failed).toBe(true);
    });

    it('user can only see sessions for their own machines', async () => {
      // Arrange
      const { data: machineA } = await insertMachine({
        user_id: userA.userId,
        name: 'A-session-machine',
      });
      const { data: machineB } = await insertMachine({
        user_id: userB.userId,
        name: 'B-session-machine',
      });
      await insertSession(machineA!.id);
      await insertSession(machineB!.id);

      // Act: userA queries sessions
      const { data: aSessions } = await userA.client.from('sessions').select('*');

      // Assert: userA only sees their own machine's session
      const machineIds = (aSessions ?? []).map((s: any) => s.machine_id);
      expect(machineIds).toContain(machineA!.id);
      expect(machineIds).not.toContain(machineB!.id);
    });

    it('user can only see their own push tokens', async () => {
      // Arrange
      await insertPushToken({ user_id: userA.userId, token: `tok-a-${Date.now()}` });
      await insertPushToken({ user_id: userB.userId, token: `tok-b-${Date.now()}` });

      // Act: userA queries push_tokens
      const { data: aTokens } = await userA.client.from('push_tokens').select('*');

      // Assert
      const userIds = (aTokens ?? []).map((t: any) => t.user_id);
      expect(userIds.every((uid: string) => uid === userA.userId)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Unique Constraints
  // -----------------------------------------------------------------------

  describe('Unique Constraints', () => {
    it('enforces unique push token', async () => {
      const sharedToken = `ExponentPushToken[unique-${Date.now()}]`;

      const { error: firstErr } = await insertPushToken({ token: sharedToken });
      expect(firstErr).toBeNull();

      const { error: secondErr } = await insertPushToken({
        token: sharedToken,
        user_id: userB.userId,
      });
      expect(secondErr).not.toBeNull();
    });

    it('enforces unique user_id + hostname', async () => {
      const hostname = `host-unique-${Date.now()}`;

      const { error: firstErr } = await insertMachine({
        user_id: userA.userId,
        name: 'dup-1',
        hostname,
      });
      expect(firstErr).toBeNull();

      const { error: secondErr } = await insertMachine({
        user_id: userA.userId,
        name: 'dup-2',
        hostname,
      });
      expect(secondErr).not.toBeNull();
    });

    it('allows multiple null hostnames for same user', async () => {
      const { error: err1 } = await insertMachine({
        user_id: userA.userId,
        name: 'null-host-1',
        hostname: null,
      });
      expect(err1).toBeNull();

      const { error: err2 } = await insertMachine({
        user_id: userA.userId,
        name: 'null-host-2',
        hostname: null,
      });
      expect(err2).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Timestamps
  // -----------------------------------------------------------------------

  describe('Timestamps', () => {
    it('auto-updates updated_at on push_tokens update', async () => {
      const { data: token } = await insertPushToken();
      expect(token).not.toBeNull();

      const createdAt = new Date(token!.updated_at).getTime();

      // Small delay so timestamp can advance
      await new Promise((r) => setTimeout(r, 50));

      // Update the token's device_name
      await serviceClient
        .from('push_tokens')
        .update({ device_name: 'updated-device' })
        .eq('id', token!.id);

      // Re-fetch
      const { data: updated } = await serviceClient
        .from('push_tokens')
        .select('*')
        .eq('id', token!.id)
        .single();

      const updatedAt = new Date(updated!.updated_at).getTime();
      expect(updatedAt).toBeGreaterThan(createdAt);
    });
  });
});
