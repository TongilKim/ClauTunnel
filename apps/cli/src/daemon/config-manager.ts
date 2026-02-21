import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type {
  InteractiveCommandType,
  InteractiveCommandData,
  InteractiveApplyPayload,
  InteractiveResult,
  InteractiveOption,
} from 'clautunnel-shared';

interface ClaudeSettings {
  preferences?: {
    verboseMode?: boolean;
    theme?: string;
    autoCompact?: boolean;
  };
  permissions?: {
    mode?: string;
    allowedTools?: string[];
    allow?: string[];
  };
  vim?: boolean;
  alwaysThinkingEnabled?: boolean;
}

export interface ConfigManagerOptions {
  cwd?: string;
  homeDir?: string;
}

export class ConfigManager {
  private claudeDir: string;
  private cwd: string;

  constructor(options: ConfigManagerOptions = {}) {
    const home = options.homeDir || homedir();
    this.claudeDir = join(home, '.claude');
    this.cwd = options.cwd || process.cwd();
  }

  private getGlobalSettingsPath(): string {
    return join(this.claudeDir, 'settings.json');
  }

  private getLocalSettingsPath(): string {
    return join(this.claudeDir, 'settings.local.json');
  }

  private getProjectSettingsPath(): string {
    return join(this.cwd, '.claude', 'settings.json');
  }

  private readSettingsFile(path: string): ClaudeSettings | null {
    try {
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      // Silently ignore read errors
    }
    return null;
  }

  private writeSettingsFile(path: string, settings: ClaudeSettings): boolean {
    try {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, JSON.stringify(settings, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  private getMergedSettings(): ClaudeSettings {
    const global = this.readSettingsFile(this.getGlobalSettingsPath()) || {};
    const local = this.readSettingsFile(this.getLocalSettingsPath()) || {};
    const project = this.readSettingsFile(this.getProjectSettingsPath()) || {};

    // Merge settings with project > local > global precedence
    return {
      ...global,
      ...local,
      ...project,
      preferences: {
        ...global.preferences,
        ...local.preferences,
        ...project.preferences,
      },
      permissions: {
        ...global.permissions,
        ...local.permissions,
        ...project.permissions,
      },
    };
  }

  /**
   * Get the current thinking mode setting from merged settings
   */
  getThinkingMode(): boolean {
    const settings = this.getMergedSettings();
    return settings.alwaysThinkingEnabled ?? false;
  }

  getInteractiveData(command: InteractiveCommandType): InteractiveCommandData {
    const settings = this.getMergedSettings();

    switch (command) {
      case 'config':
        return this.getConfigData(settings);
      case 'permissions':
        return this.getPermissionsData(settings);
      case 'vim':
        return this.getVimData(settings);
      case 'allowed-tools':
        return this.getAllowedToolsData(settings);
      default:
        return {
          command,
          uiType: 'select',
          title: `${command} Settings`,
          description: 'This command is not yet supported in mobile.',
          options: [],
        };
    }
  }

  private getConfigData(settings: ClaudeSettings): InteractiveCommandData {
    const options: InteractiveOption[] = [
      {
        id: 'alwaysThinkingEnabled',
        label: 'Thinking Mode',
        description: 'Enable extended thinking for complex tasks',
        value: settings.alwaysThinkingEnabled || false,
        selected: settings.alwaysThinkingEnabled || false,
      },
      {
        id: 'autoCompact',
        label: 'Auto-Compact',
        description: 'Automatically compact conversation when context is full',
        value: settings.preferences?.autoCompact ?? true,
        selected: settings.preferences?.autoCompact ?? true,
      },
    ];

    return {
      command: 'config',
      uiType: 'nested',
      title: 'Configuration',
      description: 'Claude Code preferences and settings',
      options,
    };
  }

  private getPermissionsData(settings: ClaudeSettings): InteractiveCommandData {
    const currentMode = settings.permissions?.mode || 'default';
    const options: InteractiveOption[] = [
      {
        id: 'default',
        label: 'Default',
        description: 'Ask before making changes to files',
        value: 'default',
        selected: currentMode === 'default',
      },
      {
        id: 'acceptEdits',
        label: 'Auto-approve Edits',
        description: 'Automatically approve file edits',
        value: 'acceptEdits',
        selected: currentMode === 'acceptEdits',
      },
      {
        id: 'plan',
        label: 'Plan Mode',
        description: 'Only plan changes without executing',
        value: 'plan',
        selected: currentMode === 'plan',
      },
      {
        id: 'bypassPermissions',
        label: 'Yolo Mode',
        description: 'Bypass all permission prompts',
        value: 'bypassPermissions',
        selected: currentMode === 'bypassPermissions',
      },
    ];

    return {
      command: 'permissions',
      uiType: 'select',
      title: 'Permission Mode',
      description: 'Select how Claude handles file edits',
      options,
      currentValue: currentMode,
    };
  }

  private getVimData(settings: ClaudeSettings): InteractiveCommandData {
    const enabled = settings.vim ?? false;

    return {
      command: 'vim',
      uiType: 'toggle',
      title: 'Vim Mode',
      description: 'Enable vim keybindings in the editor',
      options: [
        {
          id: 'vim-enabled',
          label: 'Vim Mode',
          description: enabled ? 'Currently enabled' : 'Currently disabled',
          value: enabled,
          selected: enabled,
        },
      ],
      currentValue: enabled,
    };
  }

  private getAllowedToolsData(settings: ClaudeSettings): InteractiveCommandData {
    const allowedTools = settings.permissions?.allowedTools || [];
    const allTools = [
      { id: 'Bash', label: 'Bash', description: 'Execute shell commands' },
      { id: 'Read', label: 'Read', description: 'Read file contents' },
      { id: 'Write', label: 'Write', description: 'Write to files' },
      { id: 'Edit', label: 'Edit', description: 'Edit file contents' },
      { id: 'Glob', label: 'Glob', description: 'Search for files' },
      { id: 'Grep', label: 'Grep', description: 'Search file contents' },
      { id: 'WebFetch', label: 'WebFetch', description: 'Fetch web content' },
      { id: 'WebSearch', label: 'WebSearch', description: 'Search the web' },
    ];

    const options: InteractiveOption[] = allTools.map((tool) => ({
      ...tool,
      value: tool.id,
      selected: allowedTools.includes(tool.id),
    }));

    return {
      command: 'allowed-tools',
      uiType: 'multi-select',
      title: 'Allowed Tools',
      description: 'Select which tools Claude can use',
      options,
      currentValue: allowedTools,
    };
  }

  applyChange(payload: InteractiveApplyPayload): InteractiveResult {
    const globalPath = this.getGlobalSettingsPath();
    const settings = this.readSettingsFile(globalPath) || {};

    try {
      switch (payload.command) {
        case 'config':
          return this.applyConfigChange(settings, globalPath, payload);
        case 'permissions':
          return this.applyPermissionsChange(settings, globalPath, payload);
        case 'vim':
          return this.applyVimChange(settings, globalPath, payload);
        case 'allowed-tools':
          return this.applyAllowedToolsChange(settings, globalPath, payload);
        default:
          return {
            success: false,
            message: `Unknown command: ${payload.command}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private applyConfigChange(
    settings: ClaudeSettings,
    path: string,
    payload: InteractiveApplyPayload
  ): InteractiveResult {
    if (!settings.preferences) {
      settings.preferences = {};
    }

    switch (payload.key) {
      case 'theme':
        settings.preferences.theme = payload.value as string;
        break;
      case 'alwaysThinkingEnabled':
        // alwaysThinkingEnabled is at root level, not in preferences
        settings.alwaysThinkingEnabled = payload.value as boolean;
        break;
      case 'autoCompact':
        settings.preferences.autoCompact = payload.value as boolean;
        break;
      case 'verbose':
        settings.preferences.verboseMode = payload.value as boolean;
        break;
      default:
        return { success: false, message: `Unknown config key: ${payload.key}` };
    }

    if (this.writeSettingsFile(path, settings)) {
      return { success: true, message: `Config ${payload.key} updated` };
    }
    return { success: false, message: 'Failed to write settings file' };
  }

  private applyPermissionsChange(
    settings: ClaudeSettings,
    path: string,
    payload: InteractiveApplyPayload
  ): InteractiveResult {
    if (!settings.permissions) {
      settings.permissions = {};
    }

    settings.permissions.mode = payload.value as string;

    if (this.writeSettingsFile(path, settings)) {
      return { success: true, message: `Permission mode set to ${payload.value}` };
    }
    return { success: false, message: 'Failed to write settings file' };
  }

  private applyVimChange(
    settings: ClaudeSettings,
    path: string,
    payload: InteractiveApplyPayload
  ): InteractiveResult {
    if (payload.action === 'toggle') {
      settings.vim = !settings.vim;
    } else {
      settings.vim = payload.value as boolean;
    }

    if (this.writeSettingsFile(path, settings)) {
      return { success: true, message: `Vim mode ${settings.vim ? 'enabled' : 'disabled'}` };
    }
    return { success: false, message: 'Failed to write settings file' };
  }

  private applyAllowedToolsChange(
    settings: ClaudeSettings,
    path: string,
    payload: InteractiveApplyPayload
  ): InteractiveResult {
    if (!settings.permissions) {
      settings.permissions = {};
    }
    if (!settings.permissions.allowedTools) {
      settings.permissions.allowedTools = [];
    }

    const toolId = payload.value as string;

    switch (payload.action) {
      case 'add':
        if (!settings.permissions.allowedTools.includes(toolId)) {
          settings.permissions.allowedTools.push(toolId);
        }
        break;
      case 'remove':
        settings.permissions.allowedTools = settings.permissions.allowedTools.filter(
          (t) => t !== toolId
        );
        break;
      case 'set':
        settings.permissions.allowedTools = payload.value as string[];
        break;
      case 'toggle':
        if (settings.permissions.allowedTools.includes(toolId)) {
          settings.permissions.allowedTools = settings.permissions.allowedTools.filter(
            (t) => t !== toolId
          );
        } else {
          settings.permissions.allowedTools.push(toolId);
        }
        break;
    }

    if (this.writeSettingsFile(path, settings)) {
      return { success: true, message: 'Allowed tools updated' };
    }
    return { success: false, message: 'Failed to write settings file' };
  }
}
