import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { unstable_v2_createSession, unstable_v2_resumeSession } from '@anthropic-ai/claude-agent-sdk';
import type { SDKSession as V2Session, SDKSessionOptions, SDKMessage, SlashCommand as SDKSlashCommand, CanUseTool, PermissionResult, PermissionUpdate as SDKPermissionUpdate, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
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
  private isProcessing: boolean = false;
  private currentPermissionMode: PermissionMode;
  private v2Session: V2Session | null = null;
  private streamLoopRunning: boolean = false;
  private cachedCommands: SlashCommand[] | null = null;
  private cachedModels: ModelInfo[] | null = null;
  private currentModel: string = 'default';
  private conversationHistory: ConversationMessage[] = [];
  private pendingContextTransfer: boolean = false;
  private thinkingEnabled: boolean = false;
  private pendingPermissionRequests: Map<string, PendingPermissionRequest> = new Map();
  // Pending AskUserQuestion answer resolver - resolved by provideAnswer()
  private pendingAnswerResolve: ((answers: Record<string, string>) => void) | null = null;
  // Track current assistant response text for conversation history
  private currentAssistantResponse: string = '';

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
   *
   * AskUserQuestion goes through this path: the subprocess sends a
   * control_request with subtype "can_use_tool" and blocks until a
   * control_response is returned.  For AskUserQuestion we emit a
   * user-question event, wait for provideAnswer() to resolve the pending
   * promise, and return {behavior:'allow', updatedInput:{questions, answers}}
   * so the subprocess can produce the tool_result and continue.
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

      // --- AskUserQuestion: route through user-question event -----------
      if (toolName === 'AskUserQuestion') {
        const questionInput = input as {
          questions?: Array<{
            question: string;
            header: string;
            options: Array<{ label: string; description: string }>;
            multiSelect?: boolean;
          }>;
        };

        if (questionInput.questions && Array.isArray(questionInput.questions)) {
          const questions: UserQuestion[] = questionInput.questions.map(q => ({
            question: q.question,
            header: q.header,
            options: (q.options || []).map(o => ({
              label: o.label,
              description: o.description,
            })),
            multiSelect: q.multiSelect,
          }));

          const questionData: UserQuestionData = {
            toolUseId: options.toolUseID,
            questions,
          };

          // Broadcast to mobile
          this.emit('user-question', questionData);

          // Wait for provideAnswer() to supply the answers
          const answers = await new Promise<Record<string, string>>(
            (resolve, reject) => {
              this.pendingAnswerResolve = resolve;

              // Clean up if the request is aborted (e.g. session cancelled)
              options.signal.addEventListener('abort', () => {
                this.pendingAnswerResolve = null;
                reject(new Error('Question aborted'));
              });
            }
          );

          this.pendingAnswerResolve = null;

          // Return updatedInput so the subprocess can build the tool_result
          return {
            behavior: 'allow' as const,
            updatedInput: {
              questions: questionInput.questions,
              answers,
            },
          };
        }
      }

      // --- Regular permission request: broadcast to mobile and wait -----
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
    this.emit('thinking-mode', enabled);
  }

  getThinkingMode(): boolean {
    return this.thinkingEnabled;
  }

  /**
   * Build V2 session options from current state
   */
  private buildSessionOptions(): SDKSessionOptions {
    const opts: SDKSessionOptions = {
      // SDK accepts shorthand model names: 'opus' | 'sonnet' | 'haiku'
      // Full model IDs (e.g. 'claude-opus-4-6') are also valid but shorthand is preferred
      model: this.currentModel === 'default' ? 'opus' : this.currentModel,
      allowedTools: this.options.allowedTools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
      canUseTool: this.createCanUseTool(),
      permissionMode: this.currentPermissionMode,
    };
    return opts;
  }

  /**
   * Ensure a V2 session exists, creating one if needed
   */
  private ensureSession(): V2Session {
    if (!this.v2Session) {
      const opts = this.buildSessionOptions();

      if (this.sessionId) {
        // Resume existing session
        this.v2Session = unstable_v2_resumeSession(this.sessionId, opts);
      } else {
        // Create new session
        this.v2Session = unstable_v2_createSession(opts);
      }

      // Start the background message processing loop
      this.startStreamLoop();
    }
    return this.v2Session;
  }

  /**
   * Background loop that processes messages from the V2 session stream.
   * Runs continuously for the lifetime of the session.
   */
  private async startStreamLoop(): Promise<void> {
    if (this.streamLoopRunning || !this.v2Session) return;
    this.streamLoopRunning = true;

    try {
      // The V2 stream() returns after each 'result' message.
      // For multi-turn sessions, we need to call stream() again after each result.
      while (this.v2Session && !this.v2Session['closed']) {
        for await (const message of this.v2Session.stream()) {
          this.processMessage(message);
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        this.emit('error', error);
      }
    } finally {
      this.streamLoopRunning = false;
    }
  }

  /**
   * Process a single SDK message from the stream
   */
  private processMessage(message: SDKMessage): void {
    // Handle different message types
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
            this.currentAssistantResponse += block.text;
          } else if ('type' in block && block.type === 'tool_use' && 'name' in block) {
            // AskUserQuestion tool_use blocks are handled via the canUseTool
            // callback (which emits 'user-question' and waits for the answer).
            // No special handling needed here in the stream.
          }
        }
      }
    } else if (message.type === 'result') {
      // Emit result text if no assistant output was captured (e.g. slash commands like /context)
      if (!this.currentAssistantResponse.trim() && 'result' in message && message.result) {
        const resultText = String(message.result);
        this.emit('output', resultText);
        this.currentAssistantResponse = resultText;
      }
      // Final result - track assistant response in history
      if (this.currentAssistantResponse.trim()) {
        this.conversationHistory.push({ role: 'assistant', content: this.currentAssistantResponse.trim() });
      }

      this.currentAssistantResponse = '';
      this.isProcessing = false;
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

  async sendPrompt(prompt: string, attachments?: ImageAttachment[]): Promise<void> {
    if (this.isProcessing) {
      this.emit('output', '\n[TermBridge] Previous request still processing...\n');
      this.emit('request-rejected', 'Your message was not processed because Claude is still working on the previous request. Please wait.');
      return;
    }

    this.isProcessing = true;
    this.currentAssistantResponse = '';

    // Track user message in conversation history
    if (prompt.trim()) {
      this.conversationHistory.push({ role: 'user', content: prompt });
    }

    try {
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

      // Ensure we have a V2 session
      const session = this.ensureSession();

      // Build message content
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

      // Build and send the user message via V2 session.send()
      const userMessage: SDKUserMessage = {
        type: 'user' as const,
        message: {
          role: 'user' as const,
          content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text' as const, text: finalPrompt }],
        },
        parent_tool_use_id: null,
        session_id: this.sessionId || '',
      };

      await session.send(userMessage);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.emit('output', '\n[Cancelled]\n');
      } else {
        this.emit('error', error);
        this.emit('output', `\n[Error: ${(error as Error).message}]\n`);
      }
      this.isProcessing = false;
    }
  }

  /**
   * Provide an answer to a pending AskUserQuestion.
   *
   * AskUserQuestion flows through the canUseTool callback which blocks
   * waiting for a Promise to resolve.  This method resolves that Promise
   * with the user's answers, which causes canUseTool to return
   * {behavior:'allow', updatedInput:{questions, answers}} → the SDK
   * sends the control_response back to the subprocess → it unblocks and
   * builds the tool_result for the Claude API.
   */
  async provideAnswer(answerText: string, answers?: Record<string, string>): Promise<void> {
    // Track in conversation history
    if (answerText.trim()) {
      this.conversationHistory.push({ role: 'user', content: answerText });
    }

    if (this.pendingAnswerResolve) {
      // Resolve the pending canUseTool callback with the answers
      const resolvedAnswers = answers || { result: answerText };
      this.pendingAnswerResolve(resolvedAnswers);
      this.pendingAnswerResolve = null;
      return;
    }

    // No pending question - fall back to sendPrompt
    await this.sendPrompt(answerText);
  }

  cancel(): void {
    this.pendingAnswerResolve = null;
    if (this.v2Session) {
      this.v2Session.close();
      this.v2Session = null;
      this.streamLoopRunning = false;
    }
    this.isProcessing = false;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Resume a different session by setting its ID.
   * The next sendPrompt call will use this session ID.
   */
  resumeSession(sessionId: string): void {
    // Close existing session if any
    if (this.v2Session) {
      this.v2Session.close();
      this.v2Session = null;
      this.streamLoopRunning = false;
    }
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

    // Close existing session - a new one will be created with the new model on next sendPrompt()
    if (this.v2Session) {
      this.v2Session.close();
      this.v2Session = null;
      this.streamLoopRunning = false;
      this.sessionId = null;
      this.pendingContextTransfer = true;
    } else if (this.sessionId) {
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
    // Close existing session and force a fresh one on next prompt
    if (this.v2Session) {
      this.v2Session.close();
      this.v2Session = null;
      this.streamLoopRunning = false;
    }
    this.sessionId = null;
  }

  async getSupportedModels(): Promise<ModelInfo[]> {
    // Fallback models matching SDK response format
    const coreModels: ModelInfo[] = [
      { value: 'default', displayName: 'Default (recommended)', description: 'Use the default model (currently Opus 4.6)' },
      { value: 'opus', displayName: 'Opus', description: 'Opus 4.6 · Most capable for complex work' },
      { value: 'haiku', displayName: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' },
      { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 4.5 · Best for everyday tasks' },
    ];

    // Return cached SDK models if available
    if (this.cachedModels) {
      return this.cachedModels;
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
    }

    // Add fallback commands
    const existingNames = new Set(allCommands.map(c => c.name));
    const uniqueFallbacks = fallbackCommands.filter(c => !existingNames.has(c.name));
    allCommands = [...allCommands, ...uniqueFallbacks];

    allCommands = allCommands.filter(c => !UNSUPPORTED_COMMANDS.has(c.name));

    return allCommands;
  }
}
