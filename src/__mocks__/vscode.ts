import { vi } from 'vitest';

// Mock VS Code API for testing
export const mockVSCode = {
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    createStatusBarItem: vi.fn(() => ({
      text: '',
      command: '',
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    createTreeView: vi.fn(() => ({
      onDidChangeSelection: vi.fn(),
      onDidChangeVisibility: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: '/test/workspace',
        },
      },
    ],
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
    onDidChangeConfiguration: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  authentication: {
    registerAuthenticationProvider: vi.fn(),
    onDidChangeSessions: vi.fn(),
  },
  env: {
    openExternal: vi.fn(),
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: vi.fn(),
  Uri: {
    parse: vi.fn((uri: string) => ({ fsPath: uri })),
    file: vi.fn((path: string) => ({ fsPath: path })),
  },
  Disposable: {
    from: vi.fn((..._disposables: unknown[]) => ({
      dispose: vi.fn(),
    })),
  },
  EventEmitter: vi.fn(() => ({
    fire: vi.fn(),
    event: vi.fn(),
    dispose: vi.fn(),
  })),
  Event: {
    fromPromise: vi.fn(),
  },
  secrets: {
    store: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  ExtensionContext: {
    subscriptions: [],
    secrets: {
      store: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
  },
};

// Mock the vscode module
vi.mock('vscode', () => mockVSCode);

export default mockVSCode;
