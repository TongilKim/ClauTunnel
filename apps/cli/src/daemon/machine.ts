import type { SupabaseClient } from '@supabase/supabase-js';
import type { Machine, MachineStatus } from 'clautunnel-shared';
import * as os from 'os';

export interface MachineManagerOptions {
  supabase: SupabaseClient;
}

export class MachineManager {
  private supabase: SupabaseClient;

  constructor(options: MachineManagerOptions) {
    this.supabase = options.supabase;
  }

  async registerMachine(
    userId: string,
    name?: string,
    machineId?: string
  ): Promise<Machine> {
    const hostname = os.hostname();
    const machineName = name || hostname;

    // If machineId provided, try to update existing machine
    if (machineId) {
      const existing = await this.getMachine(machineId);
      if (existing) {
        await this.updateMachineStatus(machineId, 'online');
        return existing;
      }
    }

    // Check if machine with same user_id and hostname already exists
    const { data: existingByHostname } = await this.supabase
      .from('machines')
      .select()
      .eq('user_id', userId)
      .eq('hostname', hostname)
      .single();

    if (existingByHostname) {
      // Update existing machine and return it
      await this.updateMachineStatus(existingByHostname.id, 'online');
      return existingByHostname as Machine;
    }

    // Create new machine
    const { data, error } = await this.supabase
      .from('machines')
      .insert({
        user_id: userId,
        name: machineName,
        hostname,
        status: 'online' as MachineStatus,
        last_seen_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to register machine: ${error.message}`);
    }

    return data as Machine;
  }

  async getMachine(machineId: string): Promise<Machine | null> {
    const { data, error } = await this.supabase
      .from('machines')
      .select()
      .eq('id', machineId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(`Failed to get machine: ${error.message}`);
    }

    return data as Machine;
  }

  async updateMachineStatus(
    machineId: string,
    status: MachineStatus
  ): Promise<void> {
    const { error } = await this.supabase
      .from('machines')
      .update({
        status,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', machineId);

    if (error) {
      throw new Error(`Failed to update machine status: ${error.message}`);
    }
  }

  async heartbeat(machineId: string): Promise<void> {
    const { error } = await this.supabase
      .from('machines')
      .update({
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', machineId);

    if (error) {
      throw new Error(`Failed to update heartbeat: ${error.message}`);
    }
  }

  async listMachines(userId: string): Promise<Machine[]> {
    const { data, error } = await this.supabase
      .from('machines')
      .select()
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list machines: ${error.message}`);
    }

    return data as Machine[];
  }
}
