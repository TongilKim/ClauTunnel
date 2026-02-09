import { spawn, execSync, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import { readdirSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SleepPreventionState {
  caffeinateProcess: ChildProcess | null;
  pmsetEnabled: boolean;
}

export async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export function enableSleepPrevention(): boolean {
  try {
    execSync('sudo pmset -a disablesleep 1', { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

export function disableSleepPrevention(): void {
  try {
    execSync('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
  } catch {
    // Ignore errors on cleanup
  }
}

export function startCaffeinate(): ChildProcess {
  const process = spawn('caffeinate', ['-i', '-s'], {
    stdio: 'ignore',
    detached: false,
  });

  return process;
}

export function stopCaffeinate(process: ChildProcess | null): void {
  if (process) {
    process.kill();
  }
}

export function cleanup(state: SleepPreventionState): void {
  stopCaffeinate(state.caffeinateProcess);
  if (state.pmsetEnabled) {
    disableSleepPrevention();
  }
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export interface FullDiskAccessStatus {
  enabled: boolean;
  label: string;
  warning?: string;
}

/**
 * Checks if Full Disk Access is granted on macOS by attempting to read
 * a TCC-protected directory. Returns true on non-macOS platforms.
 */
export function checkFullDiskAccess(): boolean {
  if (!isMacOS()) return true;

  try {
    const safariDir = path.join(os.homedir(), 'Library', 'Safari');
    readdirSync(safariDir);
    return true;
  } catch {
    return false;
  }
}

const TERM_PROGRAM_MAP: Record<string, string> = {
  vscode: 'Visual Studio Code',
  Apple_Terminal: 'Terminal',
  'iTerm.app': 'iTerm2',
  WarpTerminal: 'Warp',
  Hyper: 'Hyper',
};

/**
 * Detects the terminal application name from the TERM_PROGRAM environment variable.
 */
export function getTerminalAppName(): string {
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram && TERM_PROGRAM_MAP[termProgram]) {
    return TERM_PROGRAM_MAP[termProgram];
  }
  return 'your terminal app';
}

/**
 * Opens macOS System Settings to the Full Disk Access pane.
 * Returns true on success, false on failure or non-macOS platforms.
 */
export function openFullDiskAccessSettings(): boolean {
  if (!isMacOS()) return false;

  try {
    execSync(
      'open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"'
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a structured status object with label and optional warning message
 * describing the Full Disk Access state and its implications for remote usage.
 */
export function getFullDiskAccessStatus(enabled: boolean, terminalApp?: string): FullDiskAccessStatus {
  if (enabled) {
    return {
      enabled: true,
      label: 'Enabled',
    };
  }

  const appName = terminalApp || 'your terminal app';

  return {
    enabled: false,
    label: 'Not enabled',
    warning: [
      'Without Full Disk Access, macOS may show permission dialogs',
      'when Claude tries to access certain files or directories.',
      'These dialogs are only visible on this machine\'s screen —',
      'you won\'t be able to see or approve them from the mobile app,',
      'which will cause Claude\'s operations to silently hang.',
      '',
      'To enable:',
      `  1. Open System Settings → Privacy & Security → Full Disk Access`,
      `  2. Toggle ON "${appName}" in the list`,
      '  3. Restart your terminal and run "termbridge start" again',
    ].join('\n'),
  };
}
