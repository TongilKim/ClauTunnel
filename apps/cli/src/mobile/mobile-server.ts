import { spawn, execSync, type ChildProcess } from 'child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  createWriteStream,
  type WriteStream,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { get } from 'http';
import qrcode from 'qrcode-terminal';

const REPO_URL = 'https://github.com/TongilKim/ClauTunnel.git';
const DEFAULT_MOBILE_DIR = join(homedir(), '.clautunnel', 'mobile');

export interface MobileServerOptions {
  mobileProjectPath?: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  expoPort?: number;
  logDir?: string;
  onProgress?: (message: string) => void;
}

export interface MobileServerResult {
  started: boolean;
  tunnelUrl?: string;
  error?: string;
}

interface PrerequisiteResult {
  ready: boolean;
  issues: string[];
  needsInstall: boolean;
}

export class MobileServerManager {
  private options: MobileServerOptions;
  private mobileProjectPath: string;
  private logDir: string;
  private expoPort: number;
  private ngrokProcess: ChildProcess | null = null;
  private expoProcess: ChildProcess | null = null;
  private ngrokLogStream: WriteStream | null = null;
  private expoLogStream: WriteStream | null = null;
  private tunnelUrl: string | null = null;
  private onProgress: (message: string) => void;
  private hasCustomPath: boolean;

  constructor(options: MobileServerOptions) {
    this.options = options;
    this.hasCustomPath = options.mobileProjectPath !== undefined;
    this.mobileProjectPath = options.mobileProjectPath ?? DEFAULT_MOBILE_DIR;
    this.expoPort = options.expoPort ?? 8081;
    this.logDir = options.logDir ?? join(homedir(), '.clautunnel', 'logs');
    this.onProgress = options.onProgress ?? (() => {});
  }

  getMobileProjectPath(): string {
    return this.mobileProjectPath;
  }

  checkPrerequisites(): PrerequisiteResult {
    const issues: string[] = [];
    let needsInstall = false;

    // Path check is skipped here — ensureMobileProject handles it

    // Check ngrok
    try {
      execSync('which ngrok', { stdio: 'pipe' });
    } catch {
      issues.push(
        'ngrok is not installed.\n' +
        '  Install: brew install ngrok\n' +
        '  Sign up: https://ngrok.com\n' +
        '  Auth:    ngrok config add-authtoken <your-token>'
      );
    }

    // Check node_modules
    const nodeModulesPath = join(this.mobileProjectPath, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
      needsInstall = true;
    }

    return { ready: issues.length === 0, issues, needsInstall };
  }

  ensureMobileProject(): { ready: boolean; cloned: boolean; error?: string } {
    // Check if apps/mobile subdir exists (handles both custom path and cloned repo)
    const packageJson = join(this.mobileProjectPath, 'package.json');
    if (existsSync(packageJson)) {
      return { ready: true, cloned: false };
    }

    // If custom path was provided and doesn't exist, don't auto-clone
    if (this.hasCustomPath) {
      return {
        ready: false,
        cloned: false,
        error: `Mobile project path not found: ${this.mobileProjectPath}`,
      };
    }

    // Auto-clone to default location
    try {
      // Check git is installed
      execSync('which git', { stdio: 'pipe' });
    } catch {
      return {
        ready: false,
        cloned: false,
        error: 'git is required to download the mobile app.\n' +
          '  Install: https://git-scm.com/downloads\n' +
          '  macOS:   xcode-select --install',
      };
    }

    try {
      // Clone only the apps/mobile directory using sparse checkout
      const clautunnelDir = join(homedir(), '.clautunnel');
      if (!existsSync(clautunnelDir)) {
        mkdirSync(clautunnelDir, { recursive: true });
      }

      // Clone with depth 1 and sparse checkout for apps/mobile only
      const repoDir = join(clautunnelDir, 'repo');
      if (existsSync(repoDir)) {
        // Pull latest
        execSync('git pull --ff-only', {
          cwd: repoDir,
          stdio: 'pipe',
          timeout: 60000,
        });
      } else {
        execSync(
          `git clone --depth 1 --filter=blob:none --sparse "${REPO_URL}" repo`,
          {
            cwd: clautunnelDir,
            stdio: 'pipe',
            timeout: 60000,
          }
        );
        execSync('git sparse-checkout set apps/mobile packages/shared', {
          cwd: repoDir,
          stdio: 'pipe',
          timeout: 30000,
        });
      }

      // Point mobileProjectPath to the cloned apps/mobile
      this.mobileProjectPath = join(repoDir, 'apps', 'mobile');

      if (!existsSync(join(this.mobileProjectPath, 'package.json'))) {
        return { ready: false, cloned: false, error: 'Clone succeeded but apps/mobile not found' };
      }

      return { ready: true, cloned: true };
    } catch (error) {
      return {
        ready: false,
        cloned: false,
        error: `Failed to clone mobile project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  ensureEnvFile(): void {
    const envPath = join(this.mobileProjectPath, '.env');
    const envContent = [
      `EXPO_PUBLIC_SUPABASE_URL=${this.options.supabaseUrl}`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY=${this.options.supabaseAnonKey}`,
      '',
    ].join('\n');
    writeFileSync(envPath, envContent);
  }

  installDependencies(): boolean {
    const nodeModulesPath = join(this.mobileProjectPath, 'node_modules');
    if (existsSync(nodeModulesPath)) return true;

    try {
      execSync('pnpm install', {
        cwd: this.mobileProjectPath,
        stdio: 'pipe',
        timeout: 120000, // 2 minute timeout
      });
      return true;
    } catch {
      return false;
    }
  }

  async startNgrok(): Promise<string | null> {
    this.ensureLogDir();

    this.ngrokLogStream = createWriteStream(join(this.logDir, 'ngrok.log'));

    this.ngrokProcess = spawn('ngrok', ['http', String(this.expoPort)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Redirect output to log file
    this.ngrokProcess.stdout?.pipe(this.ngrokLogStream);
    this.ngrokProcess.stderr?.pipe(this.ngrokLogStream);

    this.ngrokProcess.on('error', () => {
      // Silently handle spawn errors
    });

    // Poll for tunnel URL
    for (let i = 0; i < 10; i++) {
      await this.sleep(1000);
      const url = await this.getNgrokTunnelUrl();
      if (url) {
        this.tunnelUrl = url;
        return url;
      }
    }

    // Failed to get tunnel URL
    this.killProcess(this.ngrokProcess);
    this.ngrokProcess = null;
    return null;
  }

  async startExpo(tunnelUrl: string): Promise<boolean> {
    this.ensureLogDir();

    this.expoLogStream = createWriteStream(join(this.logDir, 'expo.log'));

    this.expoProcess = spawn('npx', ['expo', 'start', '--port', String(this.expoPort)], {
      cwd: this.mobileProjectPath,
      env: {
        ...process.env,
        EXPO_PACKAGER_PROXY_URL: tunnelUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this.expoProcess.on('error', () => {
      // Silently handle spawn errors
    });

    // Wait for Expo to be ready, print QR code if available
    return new Promise<boolean>((resolve) => {
      let ready = false;
      let resolved = false;
      let qrActive = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.expoProcess?.stdout?.pipe(this.expoLogStream!);
          this.expoProcess?.stderr?.pipe(this.expoLogStream!);
          resolve(false);
        }
      }, 60000); // 60 second timeout

      this.expoProcess?.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (ready) {
            this.expoLogStream?.write(line + '\n');
            continue;
          }

          // Print QR code lines to terminal
          if (this.isQrCodeLine(line)) {
            qrActive = true;
            process.stdout.write(line + '\n');
          } else if (qrActive && !this.isExpoReadyLine(line) && line.trim()) {
            // Lines between QR code blocks (spacing, URL info)
            process.stdout.write(line + '\n');
          } else if (this.isExpoReadyLine(line)) {
            // Expo is ready — this is our success signal
            process.stdout.write(line + '\n');
            ready = true;

            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              // Redirect remaining output to log
              this.expoProcess?.stdout?.pipe(this.expoLogStream!);
              this.expoProcess?.stderr?.pipe(this.expoLogStream!);
              resolve(true);
            }
          } else {
            // Pre-ready output goes to log
            this.expoLogStream?.write(line + '\n');
          }
        }
      });

      this.expoProcess?.stderr?.pipe(this.expoLogStream!);

      this.expoProcess?.on('exit', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });
  }

  async start(): Promise<MobileServerResult> {
    // Step 1: Ensure mobile project exists (auto-clone if needed)
    this.onProgress('Checking mobile project...');
    const projectResult = this.ensureMobileProject();
    if (!projectResult.ready) {
      return { started: false, error: projectResult.error };
    }
    if (projectResult.cloned) {
      this.onProgress('Mobile project cloned to ~/.clautunnel/repo/apps/mobile');
    }

    // Step 2: Check prerequisites (ngrok, etc.)
    this.onProgress('Checking prerequisites...');
    const prereqs = this.checkPrerequisites();
    if (!prereqs.ready) {
      return { started: false, error: prereqs.issues.join('; ') };
    }

    // Step 3: Install dependencies if needed
    if (prereqs.needsInstall) {
      this.onProgress('Installing dependencies (this may take a minute)...');
      const installed = this.installDependencies();
      if (!installed) {
        return { started: false, error: 'Failed to install mobile dependencies' };
      }
    }

    // Step 4: Sync .env file
    this.onProgress('Syncing credentials...');
    this.ensureEnvFile();

    // Step 5: Start ngrok tunnel
    this.onProgress('Starting ngrok tunnel...');
    const tunnelUrl = await this.startNgrok();
    if (!tunnelUrl) {
      return { started: false, error: 'Failed to start ngrok tunnel' };
    }

    // Step 6: Start Expo server
    this.onProgress('Starting Expo server...');
    const expoStarted = await this.startExpo(tunnelUrl);
    if (!expoStarted) {
      // Expo failed, kill ngrok too
      await this.stop();
      return { started: false, error: 'Failed to start Expo server' };
    }

    // Step 7: Show QR code for Expo Go
    const expoUrl = `exp+${tunnelUrl}`;
    console.log('');
    console.log('  Scan with Expo Go:');
    qrcode.generate(expoUrl, { small: true }, (code: string) => {
      // Indent each line for alignment
      for (const line of code.split('\n')) {
        console.log(`  ${line}`);
      }
    });
    console.log(`  ${expoUrl}`);
    console.log('');

    return { started: true, tunnelUrl };
  }

  async stop(): Promise<void> {
    if (this.expoProcess) {
      this.killProcess(this.expoProcess);
      this.expoProcess = null;
    }

    if (this.ngrokProcess) {
      this.killProcess(this.ngrokProcess);
      this.ngrokProcess = null;
    }

    if (this.expoLogStream) {
      this.expoLogStream.end();
      this.expoLogStream = null;
    }

    if (this.ngrokLogStream) {
      this.ngrokLogStream.end();
      this.ngrokLogStream = null;
    }

    this.tunnelUrl = null;
  }

  getTunnelUrl(): string | null {
    return this.tunnelUrl;
  }

  private isQrCodeLine(line: string): boolean {
    return line.includes('\u2588') || line.includes('\u2584') || line.includes('\u2580');
  }

  private isExpoReadyLine(line: string): boolean {
    return line.includes('Metro waiting on') || line.includes('Logs for your project');
  }

  private getNgrokTunnelUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      const req = get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const tunnels = JSON.parse(data).tunnels;
            const httpsTunnel = tunnels?.find(
              (t: { proto: string }) => t.proto === 'https'
            );
            resolve(httpsTunnel?.public_url ?? null);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private killProcess(proc: ChildProcess): void {
    try {
      proc.kill('SIGTERM');
      // Give it 3 seconds before SIGKILL
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Already dead
        }
      }, 3000);
    } catch {
      // Process already exited
    }
  }

  private ensureLogDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
