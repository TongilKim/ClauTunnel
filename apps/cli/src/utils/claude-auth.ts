import { execSync } from 'child_process';

export type AuthCheckFailure =
  | 'cli_not_found'
  | 'subcommand_not_supported'
  | 'not_logged_in'
  | 'unknown';

export interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string;
  apiProvider?: string;
  failure?: AuthCheckFailure;
}

/**
 * Check if the Claude CLI is authenticated by running `claude auth status --json`.
 * Distinguishes between CLI not found, subcommand not supported, and not logged in.
 */
export function checkClaudeCliAuth(): ClaudeAuthStatus {
  try {
    const output = execSync('claude auth status --json', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const status = JSON.parse(output.trim());
    if (status.loggedIn === true) {
      return {
        loggedIn: true,
        authMethod: status.authMethod,
        apiProvider: status.apiProvider,
      };
    }
    return { loggedIn: false, failure: 'not_logged_in' };
  } catch (error: unknown) {
    // execSync throws on non-zero exit codes. The CLI may still write
    // valid JSON to stdout (e.g. exit 1 + {"loggedIn": false, ...}).
    const execError = error as { stdout?: string | Buffer; message?: string };

    // Try to parse stdout from the thrown error first
    if (execError.stdout) {
      try {
        const stdout =
          typeof execError.stdout === 'string'
            ? execError.stdout
            : execError.stdout.toString('utf-8');
        const status = JSON.parse(stdout.trim());
        if (status.loggedIn === true) {
          return {
            loggedIn: true,
            authMethod: status.authMethod,
            apiProvider: status.apiProvider,
          };
        }
        return { loggedIn: false, failure: 'not_logged_in' };
      } catch {
        // stdout wasn't valid JSON — fall through to message-based detection
      }
    }

    const message = execError.message ?? String(error);

    // CLI binary not found
    if (
      message.includes('command not found') ||
      message.includes('ENOENT') ||
      message.includes('not recognized')
    ) {
      return { loggedIn: false, failure: 'cli_not_found' };
    }

    // Subcommand not supported (older CLI version)
    if (
      message.includes('Unknown command') ||
      message.includes('unknown command') ||
      message.includes('Invalid subcommand') ||
      message.includes('invalid subcommand')
    ) {
      return { loggedIn: false, failure: 'subcommand_not_supported' };
    }

    return { loggedIn: false, failure: 'unknown' };
  }
}
