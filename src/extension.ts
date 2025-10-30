import * as vscode from "vscode";
import { DevGridTreeDataProvider } from "./devgridTreeDataProvider";
import { AuthService } from "./authService";
import { DevGridAuthProvider } from "./authProvider";
import { registerAuthCommands } from "./commands/authCommands";
import { VulnerabilityDetailsPanel } from "./webviews/VulnerabilityDetailsPanel";
import { ServiceContainer } from "./services/ServiceContainer";

let statusBarItem: vscode.StatusBarItem | undefined;
let serviceContainer: ServiceContainer | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("DevGrid");
  serviceContainer = new ServiceContainer(outputChannel);
  const authProvider = new DevGridAuthProvider(context.secrets, outputChannel);
  const providerRegistration = vscode.authentication.registerAuthenticationProvider(
    DevGridAuthProvider.id,
    "DevGrid",
    authProvider,
    { supportsMultipleAccounts: false },
  );
  const authService = new AuthService(authProvider);
  const treeDataProvider = new DevGridTreeDataProvider(outputChannel, authService);

  const treeView = vscode.window.createTreeView("devgridInsights", {
    treeDataProvider,
    showCollapseAll: true,
  });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "devgrid.refresh";
  statusBarItem.text = "DevGrid: Initializing…";
  statusBarItem.show();

  const updateStatus = () => updateStatusBar(treeDataProvider);

  context.subscriptions.push(
    treeView,
    outputChannel,
    statusBarItem,
    providerRegistration,
    createConfigWatcher(treeDataProvider, updateStatus),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("devgrid")) {
        void treeDataProvider.refresh().then(updateStatus);
      }
    }),
    vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === DevGridAuthProvider.id) {
        void treeDataProvider.refresh().then(updateStatus);
      }
    }),
    vscode.commands.registerCommand("devgrid.refresh", async () => {
      if (statusBarItem) {
        statusBarItem.text = "DevGrid: Refreshing…";
      }
      await treeDataProvider.refresh();
      updateStatus();
    }),
    vscode.commands.registerCommand("devgrid.openSettings", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:devgrid.devgrid-vscode-extension devgrid");
    }),
    vscode.commands.registerCommand("devgrid.openDashboard", async () => {
      const url = treeDataProvider.getDashboardUrl();
      if (!url) {
        await vscode.window.showInformationMessage("DevGrid dashboard URL is not available. Check your configuration.");
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand("devgrid.openVulnerability", async (...args: any[]) => {
      console.log("Command handler called with args:", args);

      const extractVulnerabilityId = (arg: unknown): string | undefined => {
        if (typeof arg === "string") {
          return arg.trim() || undefined;
        }

        if (Array.isArray(arg)) {
          for (const item of arg) {
            const nested = extractVulnerabilityId(item);
            if (nested) {
              return nested;
            }
          }
          return undefined;
        }

        if (arg && typeof arg === "object") {
          const candidate =
            (arg as { vulnerabilityId?: unknown }).vulnerabilityId ??
            (arg as { id?: unknown }).id ??
            (arg as { vulnId?: unknown }).vulnId;

          if (typeof candidate === "string" && candidate.trim().length > 0) {
            return candidate.trim();
          }

          const commandArgs = (arg as { command?: { arguments?: unknown[] } }).command?.arguments;
          if (Array.isArray(commandArgs)) {
            for (const commandArg of commandArgs) {
              const nested = extractVulnerabilityId(commandArg);
              if (nested) {
                return nested;
              }
            }
          }
        }

        return undefined;
      };

      let vulnId: string | undefined;
      for (const arg of args) {
        const extracted = extractVulnerabilityId(arg);
        if (extracted) {
          vulnId = extracted;
          break;
        }
      }

      console.log("Extracted vulnId:", { vulnId, vulnIdType: typeof vulnId });

      if (!vulnId) {
        await vscode.window.showErrorMessage("DevGrid: No vulnerability ID provided");
        return;
      }

      try {
        if (!serviceContainer) {
          throw new Error('Service container not initialized');
        }

        const accessToken = await authService.getAccessToken();
        if (!accessToken) {
          await vscode.window.showErrorMessage('DevGrid: Sign in with DevGrid to view vulnerability details.');
          return;
        }

        const devgridContext = (treeDataProvider as any)?.context;
        const contextApiBaseUrl = devgridContext?.config?.apiBaseUrl;
        const apiBaseUrl =
          typeof contextApiBaseUrl === 'string' && contextApiBaseUrl.trim().length > 0
            ? contextApiBaseUrl.trim()
            : vscode.workspace.getConfiguration('devgrid').get<string>('apiBaseUrl', 'https://prod.api.devgrid.io');

        if (apiBaseUrl) {
          serviceContainer.setApiBaseUrl(apiBaseUrl);
        }

        serviceContainer.setAuthToken(accessToken);

        const vulnerabilityService = serviceContainer.getVulnerabilityService();
        const logger = serviceContainer.get('logger') as any; // ILogger

        VulnerabilityDetailsPanel.createOrShow(vulnId, vulnerabilityService, logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open vulnerability details';
        await vscode.window.showErrorMessage(`DevGrid: ${message}`);
      }
    }),
  );

  registerAuthCommands(context, authService);

  await treeDataProvider.initialize();

  // Configure the service container with the API URL from the loaded context
  const devgridContext = treeDataProvider['context'];
  const apiBaseUrl = devgridContext?.config?.apiBaseUrl?.trim() ||
    vscode.workspace.getConfiguration('devgrid').get<string>('apiBaseUrl', 'https://prod.api.devgrid.io');
  if (apiBaseUrl) {
    serviceContainer?.setApiBaseUrl(apiBaseUrl);
  }

  updateStatus();
}

export function deactivate(): void {
  statusBarItem?.dispose();
  statusBarItem = undefined;
  serviceContainer?.clear();
  serviceContainer = undefined;
}

function updateStatusBar(treeDataProvider: DevGridTreeDataProvider): void {
  if (statusBarItem) {
    statusBarItem.text = treeDataProvider.getStatusText();
  }
}

function createConfigWatcher(
  treeDataProvider: DevGridTreeDataProvider,
  onRefreshComplete: () => void,
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher("**/devgrid.y?(a)ml");
  const refresh = () => {
    void treeDataProvider.refresh().then(onRefreshComplete);
  };
  const disposables = [
    watcher,
    watcher.onDidChange(refresh),
    watcher.onDidCreate(refresh),
    watcher.onDidDelete(refresh),
  ];
  return vscode.Disposable.from(...disposables);
}
