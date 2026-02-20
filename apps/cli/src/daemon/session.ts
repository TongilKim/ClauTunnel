import type { SupabaseClient } from '@supabase/supabase-js';
import type { Session, SessionStatus } from 'termbridge-shared';

export interface SessionManagerOptions {
  supabase: SupabaseClient;
}

export class SessionManager {
  private supabase: SupabaseClient;

  constructor(options: SessionManagerOptions) {
    this.supabase = options.supabase;
  }

  async createSession(
    machineId: string,
    workingDirectory?: string
  ): Promise<Session> {
    const { data, error } = await this.supabase
      .from('sessions')
      .insert({
        machine_id: machineId,
        status: 'active' as SessionStatus,
        working_directory: workingDirectory,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return data as Session;
  }

  async endSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sessions')
      .update({
        status: 'ended' as SessionStatus,
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to end session: ${error.message}`);
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const { data, error } = await this.supabase
      .from('sessions')
      .select()
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(`Failed to get session: ${error.message}`);
    }

    return data as Session;
  }

  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus
  ): Promise<void> {
    const updates: Partial<Session> = { status };

    if (status === 'ended') {
      updates.ended_at = new Date().toISOString();
    }

    const { error } = await this.supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update session status: ${error.message}`);
    }
  }

  async updateSessionModel(
    sessionId: string,
    model: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('sessions')
      .update({ model })
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update session model: ${error.message}`);
    }
  }

  async updateSdkSessionId(
    sessionId: string,
    sdkSessionId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('sessions')
      .update({ sdk_session_id: sdkSessionId })
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update SDK session ID: ${error.message}`);
    }
  }

  async updateSessionTitle(
    sessionId: string,
    title: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('sessions')
      .update({ title })
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update session title: ${error.message}`);
    }
  }
}
