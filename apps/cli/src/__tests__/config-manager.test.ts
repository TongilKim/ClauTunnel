import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigManager } from '../daemon/config-manager.js';

const TEST_DIR = join(tmpdir(), 'clautunnel-config-manager-test-' + Date.now());
const CLAUDE_DIR = join(TEST_DIR, '.claude');

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    // Create test directories
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(CLAUDE_DIR, { recursive: true });

    configManager = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('getInteractiveData', () => {
    it('should return config data with default values when no settings exist', () => {
      const data = configManager.getInteractiveData('config');

      expect(data.command).toBe('config');
      expect(data.uiType).toBe('nested');
      expect(data.title).toBe('Configuration');
      expect(data.options.length).toBeGreaterThan(0);
    });

    it('should return permissions data with mode options', () => {
      const data = configManager.getInteractiveData('permissions');

      expect(data.command).toBe('permissions');
      expect(data.uiType).toBe('select');
      expect(data.title).toBe('Permission Mode');
      expect(data.options.length).toBe(4);
      expect(data.options.map((o) => o.id)).toContain('default');
      expect(data.options.map((o) => o.id)).toContain('bypassPermissions');
    });

    it('should return vim data as toggle', () => {
      const data = configManager.getInteractiveData('vim');

      expect(data.command).toBe('vim');
      expect(data.uiType).toBe('toggle');
      expect(data.title).toBe('Vim Mode');
      expect(data.currentValue).toBe(false);
    });

    it('should return allowed-tools data as multi-select', () => {
      const data = configManager.getInteractiveData('allowed-tools');

      expect(data.command).toBe('allowed-tools');
      expect(data.uiType).toBe('multi-select');
      expect(data.title).toBe('Allowed Tools');
      expect(data.options.length).toBeGreaterThan(0);
      expect(data.options.map((o) => o.id)).toContain('Bash');
      expect(data.options.map((o) => o.id)).toContain('Read');
    });

    it('should return unsupported message for unknown commands', () => {
      const data = configManager.getInteractiveData('mcp');

      expect(data.command).toBe('mcp');
      expect(data.description).toContain('not yet supported');
      expect(data.options).toEqual([]);
    });

    it('should read existing settings from global settings file', () => {
      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      writeFileSync(
        settingsPath,
        JSON.stringify({
          vim: true,
          permissions: { mode: 'bypassPermissions' },
        })
      );

      const configManager2 = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });

      const vimData = configManager2.getInteractiveData('vim');
      expect(vimData.currentValue).toBe(true);

      const permData = configManager2.getInteractiveData('permissions');
      expect(permData.currentValue).toBe('bypassPermissions');
      const selectedOption = permData.options.find((o) => o.selected);
      expect(selectedOption?.id).toBe('bypassPermissions');
    });

    it('should merge project settings over global settings', () => {
      // Create global settings
      const globalPath = join(CLAUDE_DIR, 'settings.json');
      writeFileSync(
        globalPath,
        JSON.stringify({
          vim: false,
          permissions: { mode: 'default' },
        })
      );

      // Create project settings directory and file
      const projectClaudeDir = join(TEST_DIR, '.claude');
      mkdirSync(projectClaudeDir, { recursive: true });
      const projectPath = join(projectClaudeDir, 'settings.json');
      writeFileSync(
        projectPath,
        JSON.stringify({
          vim: true,
          permissions: { mode: 'plan' },
        })
      );

      const configManager2 = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });

      const vimData = configManager2.getInteractiveData('vim');
      expect(vimData.currentValue).toBe(true);

      const permData = configManager2.getInteractiveData('permissions');
      expect(permData.currentValue).toBe('plan');
    });
  });

  describe('applyChange', () => {
    it('should apply permissions change and write to file', () => {
      const result = configManager.applyChange({
        command: 'permissions',
        action: 'set',
        value: 'bypassPermissions',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('bypassPermissions');

      // Verify file was written
      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.mode).toBe('bypassPermissions');
    });

    it('should toggle vim mode', () => {
      const result = configManager.applyChange({
        command: 'vim',
        action: 'toggle',
        value: true,
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.vim).toBe(true);

      // Toggle again
      const configManager2 = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });
      const result2 = configManager2.applyChange({
        command: 'vim',
        action: 'toggle',
        value: false,
      });

      expect(result2.success).toBe(true);
      const settings2 = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings2.vim).toBe(false);
    });

    it('should set vim mode directly', () => {
      const result = configManager.applyChange({
        command: 'vim',
        action: 'set',
        value: true,
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.vim).toBe(true);
    });

    it('should add tool to allowed-tools', () => {
      const result = configManager.applyChange({
        command: 'allowed-tools',
        action: 'add',
        value: 'Bash',
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.allowedTools).toContain('Bash');
    });

    it('should remove tool from allowed-tools', () => {
      // First add tools
      writeFileSync(
        join(CLAUDE_DIR, 'settings.json'),
        JSON.stringify({
          permissions: { allowedTools: ['Bash', 'Read', 'Write'] },
        })
      );

      const configManager2 = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });
      const result = configManager2.applyChange({
        command: 'allowed-tools',
        action: 'remove',
        value: 'Read',
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.allowedTools).not.toContain('Read');
      expect(settings.permissions.allowedTools).toContain('Bash');
      expect(settings.permissions.allowedTools).toContain('Write');
    });

    it('should toggle tool in allowed-tools', () => {
      const result = configManager.applyChange({
        command: 'allowed-tools',
        action: 'toggle',
        value: 'Bash',
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.allowedTools).toContain('Bash');

      // Toggle off
      const configManager2 = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });
      const result2 = configManager2.applyChange({
        command: 'allowed-tools',
        action: 'toggle',
        value: 'Bash',
      });

      expect(result2.success).toBe(true);
      const settings2 = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings2.permissions.allowedTools).not.toContain('Bash');
    });

    it('should set all allowed-tools at once', () => {
      const result = configManager.applyChange({
        command: 'allowed-tools',
        action: 'set',
        value: ['Bash', 'Read', 'Glob'],
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.allowedTools).toEqual(['Bash', 'Read', 'Glob']);
    });

    it('should apply config theme change', () => {
      const result = configManager.applyChange({
        command: 'config',
        action: 'set',
        key: 'theme',
        value: 'dark',
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.preferences.theme).toBe('dark');
    });

    it('should apply config verbose change', () => {
      const result = configManager.applyChange({
        command: 'config',
        action: 'set',
        key: 'verbose',
        value: true,
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.preferences.verboseMode).toBe(true);
    });

    it('should return error for unknown command', () => {
      const result = configManager.applyChange({
        command: 'mcp' as any,
        action: 'set',
        value: 'something',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown command');
    });

    it('should return error for unknown config key', () => {
      const result = configManager.applyChange({
        command: 'config',
        action: 'set',
        key: 'unknownKey',
        value: 'value',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown config key');
    });

    it('should create settings directory if it does not exist', () => {
      // Remove the .claude directory
      rmSync(CLAUDE_DIR, { recursive: true, force: true });

      const result = configManager.applyChange({
        command: 'vim',
        action: 'set',
        value: true,
      });

      expect(result.success).toBe(true);
      expect(existsSync(CLAUDE_DIR)).toBe(true);
    });

    it('should apply alwaysThinkingEnabled config change', () => {
      const result = configManager.applyChange({
        command: 'config',
        action: 'set',
        key: 'alwaysThinkingEnabled',
        value: true,
      });

      expect(result.success).toBe(true);

      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.alwaysThinkingEnabled).toBe(true);
    });
  });

  describe('getThinkingMode', () => {
    it('should return false when no settings exist', () => {
      expect(configManager.getThinkingMode()).toBe(false);
    });

    it('should return true when alwaysThinkingEnabled is set', () => {
      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      writeFileSync(
        settingsPath,
        JSON.stringify({ alwaysThinkingEnabled: true })
      );

      const configManager2 = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });
      expect(configManager2.getThinkingMode()).toBe(true);
    });

    it('should return false when alwaysThinkingEnabled is explicitly false', () => {
      const settingsPath = join(CLAUDE_DIR, 'settings.json');
      writeFileSync(
        settingsPath,
        JSON.stringify({ alwaysThinkingEnabled: false })
      );

      const configManager2 = new ConfigManager({ cwd: TEST_DIR, homeDir: TEST_DIR });
      expect(configManager2.getThinkingMode()).toBe(false);
    });
  });
});
