import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

interface ConfigData {
  machineId?: string;
  sessionTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  mobileProjectPath?: string;
}

export class Config {
  private configDir: string;
  private configFile: string;
  private data: ConfigData;

  constructor(configDir?: string) {
    this.configDir = configDir ?? join(homedir(), '.clautunnel');
    this.configFile = join(this.configDir, 'config.json');
    if (!configDir) {
      this.migrateFromLegacy();
    }
    this.data = this.loadConfig();
  }

  private migrateFromLegacy(): void {
    const legacyDir = join(homedir(), '.termbridge');
    if (existsSync(legacyDir) && !existsSync(this.configDir)) {
      renameSync(legacyDir, this.configDir);
      console.log(`Migrated config from ~/.termbridge to ~/.clautunnel`);
    }
  }

  private loadConfig(): ConfigData {
    if (existsSync(this.configFile)) {
      try {
        return JSON.parse(readFileSync(this.configFile, 'utf-8'));
      } catch {
        return {};
      }
    }
    return {};
  }

  private saveConfig(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    writeFileSync(this.configFile, JSON.stringify(this.data, null, 2));
  }

  getSupabaseUrl(): string {
    // Prefer env var over config file
    const url = process.env['SUPABASE_URL'] || this.data.supabaseUrl;
    if (!url) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error('SUPABASE_URL must be a valid URL');
    }

    return url;
  }

  getSupabaseAnonKey(): string {
    // Prefer env var over config file
    const key = process.env['SUPABASE_ANON_KEY'] || this.data.supabaseAnonKey;
    if (!key) {
      throw new Error('SUPABASE_ANON_KEY environment variable is not set');
    }
    return key;
  }

  setSupabaseCredentials(credentials: { url: string; anonKey: string }): void {
    this.data.supabaseUrl = credentials.url;
    this.data.supabaseAnonKey = credentials.anonKey;
    this.saveConfig();
  }

  isConfigured(): boolean {
    const hasEnvVars = !!(process.env['SUPABASE_URL'] && process.env['SUPABASE_ANON_KEY']);
    const hasConfigFile = !!(this.data.supabaseUrl && this.data.supabaseAnonKey);
    return hasEnvVars || hasConfigFile;
  }

  requireConfiguration(): void {
    if (!this.isConfigured()) {
      throw new ConfigurationError(
        'ClauTunnel is not configured.\n\n' +
          'Run "clautunnel setup" to configure your Supabase credentials.\n\n' +
          'Or set environment variables in your shell profile (~/.zshrc or ~/.bashrc):\n' +
          '  export SUPABASE_URL=https://<project-id>.supabase.co\n' +
          '  export SUPABASE_ANON_KEY=<your-anon-key>'
      );
    }
  }

  getMachineId(): string | undefined {
    return this.data.machineId;
  }

  setMachineId(machineId: string): void {
    this.data.machineId = machineId;
    this.saveConfig();
  }

  getSessionTokens(): ConfigData['sessionTokens'] | undefined {
    return this.data.sessionTokens;
  }

  setSessionTokens(tokens: ConfigData['sessionTokens']): void {
    this.data.sessionTokens = tokens;
    this.saveConfig();
  }

  // Alias for setSessionTokens
  setSession(tokens: { accessToken: string; refreshToken: string }): void {
    this.setSessionTokens(tokens);
  }

  clearSessionTokens(): void {
    delete this.data.sessionTokens;
    this.saveConfig();
  }

  getMobileProjectPath(): string | undefined {
    return this.data.mobileProjectPath;
  }

  setMobileProjectPath(path: string): void {
    this.data.mobileProjectPath = path;
    this.saveConfig();
  }
}

// Default singleton instance
let defaultConfig: Config | null = null;

export function getConfig(): Config {
  if (!defaultConfig) {
    defaultConfig = new Config();
  }
  return defaultConfig;
}
