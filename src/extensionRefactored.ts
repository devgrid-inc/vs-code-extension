import * as vscode from "vscode";
import { DevGridTreeDataProvider } from "./devgridTreeDataProvider";
import { AuthService } from "./authService";
import { DevGridAuthProvider } from "./authProvider";
import { registerAuthCommands } from "./commands/authCommands";
import { ServiceContainer } from "./services/ServiceContainer";
import type { ILogger } from "./interfaces/ILogger";

/**
 * Extension state management
 */
class ExtensionState {
  private statusBarItem?: vscode.StatusBarItem;
  private serviceContainer?: ServiceContainer;
  private treeDataProvider?: DevGridTreeDataProvider;
  private authService?: AuthService;
  private authProvider?: DevGridAuthProvider;
  private outputChannel?: vscode.OutputChannel;
  private logger?: ILogger;

  /**
   * Initializes the extension with dependency injection
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    // Create output channel and logger
    this.outputChannel = vscode.window.createOutputChannel("DevGrid");
    this.serviceContainer = new ServiceContainer(this.outputChannel);
    this.logger = this.serviceContainer.get<ILogger>('logger');

    this.logger.info('Initializing DevGrid extension');

    // Initialize authentication
    await this.initializeAuthentication(context);

    // Initialize tree data provider
    await this.initializeTreeProvider();

    // Setup status bar
    this.setupStatusBar();

    // Register commands and event handlers
    this.registerCommands(context);
    this.registerEventHandlers(context);

    // Initialize the tree provider
    await this.treeDataProvider?.initialize();
    this.updateStatusBar();
  }

  /**
   * Initializes authentication provider and service
   */
  private async initializeAuthentication(context: vscode.ExtensionContext): Promise<void> {
    this.authProvider = new DevGridAuthProvider(context.secrets, this.outputChannel!);
    
    const providerRegistration = vscode.authentication.registerAuthenticationProvider(
      DevGridAuthProvider.id,
      "DevGrid",
      this.authProvider,
      { supportsMultipleAccounts: false }
    );

    this.authService = new AuthService(this.authProvider);
    
    // Store registration for cleanup
    context.subscriptions.push(providerRegistration);
  }

  /**
   * Initializes the tree data provider with dependency injection
   */
  private async initializeTreeProvider(): Promise<void> {
    if (!this.serviceContainer || !this.authService) {
      throw new Error('Service container or auth service not initialized');
    }

    this.treeDataProvider = new DevGridTreeDataProvider(
      this.outputChannel!,
      this.authService
    );
  }

  /**
   * Sets up the status bar item
   */
  private setupStatusBar(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = "devgrid.refresh";
    this.statusBarItem.text = "DevGrid: Initializing…";
    this.statusBarItem.show();
  }

  /**
   * Registers all extension commands
   */
  private registerCommands(context: vscode.ExtensionContext): void {
    const commands = [
      vscode.commands.registerCommand("devgrid.refresh", async () => {
        if (this.statusBarItem) {
          this.statusBarItem.text = "DevGrid: Refreshing…";
        }
        await this.treeDataProvider?.refresh();
        this.updateStatusBar();
      }),

      vscode.commands.registerCommand("devgrid.openSettings", () => {
        void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:devgrid.devgrid-insights devgrid");
      }),

      vscode.commands.registerCommand("devgrid.openDashboard", async () => {
        const url = this.treeDataProvider?.getDashboardUrl();
        if (!url) {
          await vscode.window.showInformationMessage("DevGrid dashboard URL is not available. Check your configuration.");
          return;
        }
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }),
    ];

    context.subscriptions.push(...commands);

    // Register auth commands
    if (this.authService) {
      registerAuthCommands(context, this.authService);
    }
  }

  /**
   * Registers event handlers for configuration changes and authentication
   */
  private registerEventHandlers(context: vscode.ExtensionContext): void {
    const eventHandlers = [
      // Configuration change handler
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("devgrid")) {
          void this.treeDataProvider?.refresh().then(() => this.updateStatusBar());
        }
      }),

      // Authentication session change handler
      vscode.authentication.onDidChangeSessions((event) => {
        if (event.provider.id === DevGridAuthProvider.id) {
          void this.treeDataProvider?.refresh().then(() => this.updateStatusBar());
        }
      }),

      // File system watcher for devgrid.yaml files
      this.createConfigWatcher(),
    ];

    context.subscriptions.push(...eventHandlers);
  }

  /**
   * Creates a file system watcher for devgrid.yaml files
   */
  private createConfigWatcher(): vscode.Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher("**/devgrid.y?(a)ml");
    const refresh = () => {
      void this.treeDataProvider?.refresh().then(() => this.updateStatusBar());
    };
    
    const disposables = [
      watcher,
      watcher.onDidChange(refresh),
      watcher.onDidCreate(refresh),
      watcher.onDidDelete(refresh),
    ];
    
    return vscode.Disposable.from(...disposables);
  }

  /**
   * Updates the status bar with current state
   */
  private updateStatusBar(): void {
    if (this.statusBarItem && this.treeDataProvider) {
      this.statusBarItem.text = this.treeDataProvider.getStatusText();
    }
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.statusBarItem?.dispose();
    this.statusBarItem = undefined;
    this.serviceContainer?.clear();
  }
}

// Global extension state
let extensionState: ExtensionState | undefined;

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    extensionState = new ExtensionState();
    await extensionState.initialize(context);
  } catch (error) {
    console.error('Failed to activate DevGrid extension:', error);
    vscode.window.showErrorMessage(`Failed to activate DevGrid extension: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extension deactivation function
 */
export function deactivate(): void {
  extensionState?.dispose();
  extensionState = undefined;
}
