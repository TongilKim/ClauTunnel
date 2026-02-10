import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as readline from 'readline';

// Mock readline before importing prompt utils
vi.mock('readline');

const mockQuestion = vi.fn();
const mockClose = vi.fn();

vi.mocked(readline.createInterface).mockReturnValue({
  question: mockQuestion,
  close: mockClose,
} as any);

// Import after mocking
import { prompt, promptHidden } from '../utils/prompt.js';

describe('prompt utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readline.createInterface).mockReturnValue({
      question: mockQuestion,
      close: mockClose,
    } as any);
  });

  describe('prompt', () => {
    it('should ask a question and return the answer', async () => {
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => {
        cb('test answer');
      });

      const result = await prompt('What is your name? ');

      expect(mockQuestion).toHaveBeenCalledWith('What is your name? ', expect.any(Function));
      expect(mockClose).toHaveBeenCalled();
      expect(result).toBe('test answer');
    });

    it('should return empty string when user gives empty input', async () => {
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => {
        cb('');
      });

      const result = await prompt('Enter value: ');
      expect(result).toBe('');
    });

    it('should create a readline interface with stdin/stdout', async () => {
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => {
        cb('ok');
      });

      await prompt('test: ');

      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
    });
  });

  describe('promptHidden', () => {
    let originalStdin: typeof process.stdin;
    let stdinListeners: Map<string, Function>;

    beforeEach(() => {
      stdinListeners = new Map();

      // Mock stdin methods needed by promptHidden
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stdin, 'on').mockImplementation((event: string, handler: any) => {
        stdinListeners.set(event, handler);
        return process.stdin;
      });
      vi.spyOn(process.stdin, 'removeListener').mockImplementation(() => process.stdin);
      vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);

      // Default: not a TTY (skip setRawMode)
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should write the question to stdout', async () => {
      const promise = promptHidden('Password: ');

      // Simulate user typing + enter
      const dataHandler = stdinListeners.get('data');
      dataHandler?.(Buffer.from('\r'));

      await promise;
      expect(process.stdout.write).toHaveBeenCalledWith('Password: ');
    });

    it('should resolve with typed characters on enter', async () => {
      const promise = promptHidden('Password: ');

      const dataHandler = stdinListeners.get('data');
      dataHandler?.(Buffer.from('s'));
      dataHandler?.(Buffer.from('e'));
      dataHandler?.(Buffer.from('c'));
      dataHandler?.(Buffer.from('\n'));

      const result = await promise;
      expect(result).toBe('sec');
    });

    it('should handle backspace', async () => {
      const promise = promptHidden('Password: ');

      const dataHandler = stdinListeners.get('data');
      dataHandler?.(Buffer.from('a'));
      dataHandler?.(Buffer.from('b'));
      dataHandler?.(Buffer.from('\u007F')); // backspace
      dataHandler?.(Buffer.from('c'));
      dataHandler?.(Buffer.from('\n'));

      const result = await promise;
      expect(result).toBe('ac');
    });
  });
});
