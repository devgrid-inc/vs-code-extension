// Global test setup for Vitest
import { vi, afterEach } from 'vitest';

// Mock VS Code API
vi.mock('vscode', () => ({
  TreeItem: class {
    constructor(public label: string, public collapsibleState?: any) {}
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: class {
    constructor(public icon: string) {}
  },
  Uri: {
    parse: vi.fn(),
    joinPath: vi.fn(),
  },
  ViewColumn: {
    One: 1,
  },
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
    createWebviewPanel: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  authentication: {
    registerAuthenticationProvider: vi.fn(),
    onDidChangeSessions: vi.fn(),
  },
  extensions: {
    getExtension: vi.fn(() => ({
      extensionUri: 'mock-extension-uri',
    })),
  },
  StatusBarAlignment: {
    Left: 1,
  },
  Disposable: {
    from: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
  env: {
    openExternal: vi.fn(),
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
