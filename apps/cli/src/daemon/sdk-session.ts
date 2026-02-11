import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SlashCommand as SDKSlashCommand, CanUseTool, PermissionResult, PermissionUpdate as SDKPermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import type { ImageAttachment, ModelInfo, PermissionMode, SlashCommand, UserQuestionData, UserQuestion, PermissionRequestData, PermissionResponseData, PermissionUpdate } from 'termbridge-shared';
import { v4 as uuidv4 } from 'uuid';

/** Commands unsupported in remote/mobile context */
const UNSUPPORTED_COMMANDS = new Set([
  'keybindings-help', 'help', 'context', 'cost', 'release-notes',
  'vim', 'mcp', 'agents', 'hooks', 'status',
]);

export interface SdkSessionOptions {
  cwd: string;
  allowedTools?: string[];
  permissionMode?: PermissionMode;
  model?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Pending permission request with resolver
interface PendingPermissionRequest {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  signal: AbortSignal;
}

export class SdkSession extends EventEmitter {
  private options: SdkSessionOptions;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;
  private currentPermissionMode: PermissionMode;
  private currentQuery: Query | null = null;
  private cachedCommands: SlashCommand[] | null = null;
  private cachedModels: ModelInfo[] | null = null;
  private currentModel: string = 'default';
  private conversationHistory: ConversationMessage[] = [];
  private pendingContextTransfer: boolean = false;
  private thinkingEnabled: boolean = false;
  private pendingPermissionRequests: Map<string, PendingPermissionRequest> = new Map();

  constructor(options: SdkSessionOptions) {
    super();
    this.options = options;
    this.currentPermissionMode = options.permissionMode || 'default';
    this.currentModel = options.model || 'default';
  }

  /**
   * Handle permission response from mobile
   */
  handlePermissionResponse(response: PermissionResponseData): void {
    const pending = this.pendingPermissionRequests.get(response.requestId);
    if (!pending) {
      console.warn(`[WARN] No pending permission request found for ID: ${response.requestId}`);
      return;
    }

    this.pendingPermissionRequests.delete(response.requestId);

    if (response.behavior === 'allow') {
      const result: PermissionResult = {
        behavior: 'allow',
        updatedInput: response.updatedInput,
        updatedPermissions: response.updatedPermissions as SDKPermissionUpdate[] | undefined,
      };
      pending.resolve(result);
    } else {
      const result: PermissionResult = {
        behavior: 'deny',
        message: response.message || 'Permission denied by user',
      };
      pending.resolve(result);
    }
  }

  /**
   * Create canUseTool callback for SDK
   */
  private createCanUseTool(): CanUseTool {
    return async (
      toolName: string,
      input: Record<string, unknown>,
      options: {
        signal: AbortSignal;
        suggestions?: SDKPermissionUpdate[];
        blockedPath?: string;
        decisionReason?: string;
        toolUseID: string;
        agentID?: string;
      }
    ): Promise<PermissionResult> => {
      const requestId = uuidv4();

      // Convert SDK permission updates to our type
      const suggestions = options.suggestions?.map((s): PermissionUpdate => {
        // Handle different permission update types
        if (s.type === 'addRules' || s.type === 'replaceRules' || s.type === 'removeRules') {
          return {
            type: s.type,
            rules: s.rules,
            behavior: s.behavior,
            destination: s.destination,
          };
        } else if (s.type === 'setMode') {
          return {
            type: 'setMode',
            mode: s.mode as PermissionMode,
            destination: s.destination,
          };
        } else if (s.type === 'addDirectories' || s.type === 'removeDirectories') {
          return {
            type: s.type,
            directories: s.directories,
            destination: s.destination,
          };
        }
        // Fallback - should never reach here
        return s as PermissionUpdate;
      });

      const requestData: PermissionRequestData = {
        requestId,
        toolName,
        toolInput: input,
        toolUseId: options.toolUseID,
        suggestions,
        blockedPath: options.blockedPath,
        decisionReason: options.decisionReason,
        agentId: options.agentID,
      };

      // Emit event for daemon to broadcast to mobile
      this.emit('permission-request', requestData);

      // Create promise that will be resolved when mobile responds
      return new Promise<PermissionResult>((resolve, reject) => {
        this.pendingPermissionRequests.set(requestId, {
          resolve,
          reject,
          signal: options.signal,
        });

        // Handle abort
        options.signal.addEventListener('abort', () => {
          this.pendingPermissionRequests.delete(requestId);
          reject(new Error('Permission request aborted'));
        });
      });
    };
  }

  setPermissionMode(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
    this.emit('permission-mode', mode);
  }

  getPermissionMode(): PermissionMode {
    return this.currentPermissionMode;
  }

  async setThinkingMode(enabled: boolean): Promise<void> {
    this.thinkingEnabled = enabled;

    // If there's an active query, update it at runtime
    if (this.currentQuery) {
      try {
        // Use null to enable with SDK default, 0 to disable
        await this.currentQuery.setMaxThinkingTokens(enabled ? null : 0);
      } catch {
        // Silently ignore if the query doesn't support this
      }
    }

    this.emit('thinking-mode', enabled);
  }

  getThinkingMode(): boolean {
    return this.thinkingEnabled;
  }

  async sendPrompt(prompt: string, attachments?: ImageAttachment[]): Promise<void> {
    if (this.isProcessing) {
      this.emit('output', '\n[TermBridge] Previous request still processing...\n');
      this.emit('request-rejected', 'Your message was not processed because Claude is still working on the previous request. Please wait.');
      return;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    // Track user message in conversation history
    if (prompt.trim()) {
      this.conversationHistory.push({ role: 'user', content: prompt });
    }

    try {
      const queryOptions: Options = {
        allowedTools: this.options.allowedTools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        cwd: this.options.cwd,
        abortController: this.abortController,
        permissionMode: this.currentPermissionMode,
        // Pass model directly - SDK should handle aliases like 'opus', 'sonnet', 'haiku'
        model: this.currentModel,
        // Custom permission handler to route to mobile
        canUseTool: this.createCanUseTool(),
      };

      // Resume session if we have one
      if (this.sessionId) {
        queryOptions.resume = this.sessionId;
      }

      // Build the prompt text, including context if transferring to new session
      let finalPrompt = prompt;
      if (this.pendingContextTransfer && this.conversationHistory.length > 1) {
        // Build context from previous conversation (excluding current message)
        const previousHistory = this.conversationHistory.slice(0, -1);
        const contextLines = previousHistory.map(msg =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        );
        const contextPrefix = `[Previous conversation context - you switched to a new model]\n${contextLines.join('\n')}\n\n[Continue with new message]\n`;
        finalPrompt = contextPrefix + prompt;
        this.pendingContextTransfer = false;
      }

      // Always use streaming input mode (AsyncIterable) to enable setModel() and setPermissionMode()
      const contentBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

      // Add images if present
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: attachment.mediaType,
              data: attachment.data,
            },
          });
        }
      }

      // Add text
      if (finalPrompt.trim()) {
        contentBlocks.push({
          type: 'text',
          text: finalPrompt,
        });
      }

      // Create async iterable for SDKUserMessage (streaming input mode)
      const sessionId = this.sessionId || '';
      async function* createUserMessage() {
        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: finalPrompt }],
          },
          parent_tool_use_id: null,
          session_id: sessionId,
        };
      }

      const queryPrompt = createUserMessage();

      this.currentQuery = query({
        prompt: queryPrompt,
        options: queryOptions,
      });

      // Enable thinking mode if set (use null to enable with SDK default)
      if (this.thinkingEnabled) {
        try {
          await this.currentQuery.setMaxThinkingTokens(null);
        } catch {
          // Silently ignore if not supported
        }
      }

      // Track assistant response for this turn
      let assistantResponse = '';

      for await (const message of this.currentQuery) {
        // Handle different message types based on the SDK types
        if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
          // Capture session ID for resuming
          this.sessionId = message.session_id;
          this.emit('session-started', this.sessionId);

          // Emit permission mode if present
          if ('permissionMode' in message) {
            this.emit('permission-mode', message.permissionMode);
          }

          // Capture slash commands from init message (includes plugins/skills)
          if ('slash_commands' in message && Array.isArray(message.slash_commands)) {
            // slash_commands can be either strings or objects
            this.cachedCommands = message.slash_commands.map((cmd: unknown) => {
              if (typeof cmd === 'string') {
                return { name: cmd, description: '', argumentHint: '' };
              } else if (typeof cmd === 'object' && cmd !== null) {
                const cmdObj = cmd as SDKSlashCommand;
                return {
                  name: cmdObj.name || '',
                  description: cmdObj.description || '',
                  argumentHint: cmdObj.argumentHint || '',
                };
              }
              return { name: String(cmd), description: '', argumentHint: '' };
            });
            this.emit('commands-updated', this.cachedCommands);
          }
        } else if (message.type === 'assistant') {
          // Assistant text output and tool use
          if (message.message?.content) {
            for (const block of message.message.content) {
              if ('type' in block && block.type === 'text' && 'text' in block) {
                this.emit('output', block.text);
                assistantResponse += block.text;
              } else if ('type' in block && block.type === 'tool_use' && 'name' in block) {
                // Check for AskUserQuestion tool
                if (block.name === 'AskUserQuestion' && 'input' in block && 'id' in block) {
                  const input = block.input as { questions?: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect?: boolean }> };
                  if (input.questions && Array.isArray(input.questions)) {
                    const questions: UserQuestion[] = input.questions.map(q => ({
                      question: q.question,
                      header: q.header,
                      options: q.options.map(o => ({ label: o.label, description: o.description })),
                      multiSelect: q.multiSelect,
                    }));
                    const questionData: UserQuestionData = {
                      toolUseId: block.id as string,
                      questions,
                    };
                    this.emit('user-question', questionData);
                  }
                }
              }
            }
          }
        } else if (message.type === 'result') {
          // Emit result text if no assistant output was captured (e.g. slash commands like /context)
          if (!assistantResponse.trim() && 'result' in message && message.result) {
            const resultText = String(message.result);
            this.emit('output', resultText);
            assistantResponse = resultText;
          }
          // Final result - track assistant response in history
          if (assistantResponse.trim()) {
            this.conversationHistory.push({ role: 'assistant', content: assistantResponse.trim() });
          }
          this.emit('complete');
        } else if (message.type === 'tool_progress') {
          // Tool progress (tool being used)
          if ('tool_name' in message) {
            this.emit('output', `\n[Using tool: ${message.tool_name}]\n`);
          }
        } else if (message.type === 'tool_use_summary') {
          // Tool use summary
          if ('tool_name' in message) {
            this.emit('output', `[Tool ${message.tool_name} completed]\n`);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.emit('output', '\n[Cancelled]\n');
      } else {
        this.emit('error', error);
        this.emit('output', `\n[Error: ${(error as Error).message}]\n`);
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Resume a different session by setting its ID.
   * The next sendPrompt call will use this session ID.
   */
  resumeSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.conversationHistory = []; // Clear local history since we're resuming a different session
    this.emit('session-resumed', sessionId);
  }

  isActive(): boolean {
    return this.isProcessing;
  }

  async setModel(model: string): Promise<void> {
    if (model === this.currentModel) return;

    this.currentModel = model;

    // If there's an active query, use SDK's runtime setModel() to switch mid-session
    if (this.currentQuery) {
      try {
        await this.currentQuery.setModel(model);
      } catch {
        // If runtime setModel fails, fall back to creating a new session on next prompt
        this.sessionId = null;
        this.pendingContextTransfer = true;
      }
    } else if (this.sessionId) {
      // No active query - will take effect on next sendPrompt() via Options.model
      this.sessionId = null;
      this.pendingContextTransfer = true;
    }

    this.emit('model', model);
  }

  getModel(): string {
    return this.currentModel;
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
    // Also clear session ID to force a fresh session on next prompt
    this.sessionId = null;
  }

  async getSupportedModels(): Promise<ModelInfo[]> {
    // Fallback models matching SDK response format
    const coreModels: ModelInfo[] = [
      { value: 'default', displayName: 'Default (recommended)', description: 'Use the default model (currently Sonnet 4.5)' },
      { value: 'opus', displayName: 'Opus', description: 'Opus 4.6 · Most capable for complex work' },
      { value: 'haiku', displayName: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' },
      { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 4.5 · Best for everyday tasks' },
    ];

    // Return cached SDK models if available
    if (this.cachedModels) {
      return this.cachedModels;
    }

    if (!this.currentQuery) {
      return coreModels;
    }

    try {
      const sdkModels = await this.currentQuery.supportedModels();
      if (sdkModels && sdkModels.length > 0) {
        const mappedModels = sdkModels.map((m: { value?: string; displayName?: string; description?: string }) => ({
          value: m.value || '',
          displayName: m.displayName || m.value || '',
          description: m.description || '',
        }));

        // Cache for future calls (including new sessions before a query is active)
        this.cachedModels = mappedModels;
        return mappedModels;
      }
    } catch {
      // Fall through to core models
    }

    return coreModels;
  }

  /**
   * Scan file system for custom commands/skills
   * Commands are in ~/.claude/commands/ and .claude/commands/
   * Subdirectories create namespaced commands (e.g., gsd/add-phase.md -> gsd:add-phase)
   */
  private scanCustomCommands(): SlashCommand[] {
    const commands: SlashCommand[] = [];
    const homeDir = os.homedir();

    // Directories to scan
    const dirs = [
      path.join(homeDir, '.claude', 'commands'),      // Personal commands
      path.join(this.options.cwd, '.claude', 'commands'), // Project commands
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Namespaced commands (e.g., gsd/)
            const namespace = entry.name;
            const subDir = path.join(dir, namespace);
            const subEntries = fs.readdirSync(subDir);

            for (const file of subEntries) {
              if (file.endsWith('.md')) {
                const name = `${namespace}:${file.replace('.md', '')}`;
                const description = this.extractDescription(path.join(subDir, file));
                commands.push({ name, description, argumentHint: '' });
              }
            }
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            // Top-level commands
            const name = entry.name.replace('.md', '');
            const description = this.extractDescription(path.join(dir, entry.name));
            commands.push({ name, description, argumentHint: '' });
          }
        }
      } catch {
        // Ignore errors scanning directories
      }
    }

    return commands;
  }

  /**
   * Extract description from markdown file (first line or frontmatter)
   */
  private extractDescription(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check for frontmatter description
      if (lines[0] === '---') {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          if (line === '---') break;
          if (line.startsWith('description:')) {
            return line.replace('description:', '').trim().replace(/^["']|["']$/g, '');
          }
        }
      }

      // Use first heading or first line as description
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          return trimmed.replace('# ', '');
        }
        if (trimmed && !trimmed.startsWith('---')) {
          return trimmed.slice(0, 100);
        }
      }
    } catch {
      // Ignore errors
    }
    return '';
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    // Fallback commands - known Claude Code built-in commands
    // Sources: https://shipyard.build/blog/claude-code-cheat-sheet/
    //          https://www.eesel.ai/blog/slash-commands-claude-code
    const fallbackCommands: SlashCommand[] = [
      // Session management
      { name: 'help', description: 'Show all commands and custom slash commands', argumentHint: '' },
      { name: 'clear', description: 'Clear the conversation history', argumentHint: '' },
      { name: 'compact', description: 'Compress conversation by summarizing older messages', argumentHint: '' },
      { name: 'resume', description: 'Resume a previous conversation', argumentHint: '<session-id>' },
      { name: 'rewind', description: 'Go back to a previous message in the session', argumentHint: '' },
      { name: 'context', description: 'Check context and excluded skills', argumentHint: '' },
      // Configuration
      { name: 'config', description: 'Configure Claude Code settings interactively', argumentHint: '' },
      { name: 'permissions', description: 'View or update tool permissions', argumentHint: '' },
      { name: 'allowed-tools', description: 'Configure tool permissions interactively', argumentHint: '' },
      { name: 'model', description: 'Change the AI model', argumentHint: '' },
      { name: 'vim', description: 'Enable vim-style editing mode', argumentHint: '' },
      // Integrations
      { name: 'hooks', description: 'Configure hooks', argumentHint: '' },
      { name: 'mcp', description: 'Manage MCP servers', argumentHint: '' },
      { name: 'agents', description: 'Manage subagents (create, edit, list)', argumentHint: '' },
      { name: 'terminal-setup', description: 'Install terminal shortcuts for iTerm2/VS Code', argumentHint: '' },
      { name: 'install-github-app', description: 'Set up GitHub Actions integration', argumentHint: '' },
      { name: 'ide', description: 'Open in IDE or configure IDE integration', argumentHint: '' },
      // Project
      { name: 'init', description: 'Initialize Claude Code and generate CLAUDE.md', argumentHint: '' },
      { name: 'memory', description: 'Edit CLAUDE.md memory file', argumentHint: '' },
      { name: 'add-dir', description: 'Add a directory to the context', argumentHint: '<path>' },
      // Git & Code Review
      { name: 'commit', description: 'Commit changes to git with a generated message', argumentHint: '' },
      { name: 'review', description: 'Review code changes', argumentHint: '' },
      { name: 'review-pr', description: 'Review a GitHub pull request', argumentHint: '<pr-url>' },
      { name: 'pr-comments', description: 'Get comments from a GitHub pull request', argumentHint: '' },
      { name: 'release-notes', description: 'Generate release notes', argumentHint: '' },
      { name: 'security-review', description: 'Perform a security review', argumentHint: '' },
      // Account & System
      { name: 'login', description: 'Log in to your Anthropic account', argumentHint: '' },
      { name: 'logout', description: 'Log out of your Anthropic account', argumentHint: '' },
      { name: 'doctor', description: 'Check Claude Code health and configuration', argumentHint: '' },
      { name: 'bug', description: 'Report a bug to Anthropic', argumentHint: '' },
      { name: 'cost', description: 'Show token usage and cost', argumentHint: '' },
      { name: 'status', description: 'Show current session status', argumentHint: '' },
    ];

    // Get custom commands from file system (includes gsd:* etc.)
    const customCommands = this.scanCustomCommands();

    // Start with all commands
    let allCommands: SlashCommand[] = [...customCommands];

    // Add cached commands from init message
    if (this.cachedCommands && this.cachedCommands.length > 0) {
      const existingNames = new Set(allCommands.map(c => c.name));
      const newCached = this.cachedCommands.filter(c => !existingNames.has(c.name));
      allCommands = [...allCommands, ...newCached];
    } else if (this.currentQuery) {
      // Try SDK supportedCommands() as fallback
      try {
        const sdkCommands = await this.currentQuery.supportedCommands();

        const existingNames = new Set(allCommands.map(c => c.name));
        for (const cmd of sdkCommands) {
          if (!existingNames.has(cmd.name)) {
            allCommands.push({
              name: cmd.name,
              description: cmd.description,
              argumentHint: cmd.argumentHint || '',
            });
          }
        }
      } catch {
        // Ignore SDK supportedCommands() errors
      }
    }

    // Add fallback commands
    const existingNames = new Set(allCommands.map(c => c.name));
    const uniqueFallbacks = fallbackCommands.filter(c => !existingNames.has(c.name));
    allCommands = [...allCommands, ...uniqueFallbacks];

    allCommands = allCommands.filter(c => !UNSUPPORTED_COMMANDS.has(c.name));

    return allCommands;
  }
}
