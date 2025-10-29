// Global test setup for Vitest
import { vi, afterEach } from 'vitest';

// Mock VS Code API
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{
      uri: { fsPath: '/test/workspace' },
      name: 'test-workspace',
    }],
  },
  window: {
    createOutputChannel: vi.fn().mockReturnValue({
      appendLine: vi.fn(),
    }),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  authentication: {
    registerAuthenticationProvider: vi.fn(),
    onDidChangeSessions: vi.fn(),
  },
  StatusBarAlignment: {
    Left: 1,
  },
  Disposable: {
    from: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
}));

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock process.env for consistent testing
process.env.NODE_ENV = 'test';

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
