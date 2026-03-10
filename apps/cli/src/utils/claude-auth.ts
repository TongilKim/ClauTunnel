import { execSync } from 'child_process';

export interface ClaudeAuthStatus {
  loggedIn: boolean;
  authMethod?: string;
  apiProvider?: string;
}

/**
 * Check if the Claude CLI is authenticated by running `claude auth status --json`.
 * Returns { loggedIn: false } if the command fails or reports not logged in.
 */
export function checkClaudeCliAuth(): ClaudeAuthStatus {
  try {
    const output = execSync('claude auth status --json', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const status = JSON.parse(output.trim());
    return {
      loggedIn: status.loggedIn === true,
      authMethod: status.authMethod,
      apiProvider: status.apiProvider,
    };
  } catch {
    // Command failed or not found — treat as not logged in
    return { loggedIn: false };
  }
}
