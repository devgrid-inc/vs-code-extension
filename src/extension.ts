import * as vscode from "vscode";
import { DevGridTreeDataProvider } from "./devgridTreeDataProvider";
import { AuthService } from "./authService";
import { DevGridAuthProvider } from "./authProvider";
import { registerAuthCommands } from "./commands/authCommands";

let statusBarItem: vscode.StatusBarItem | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("DevGrid");
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
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:devgrid.devgrid-insights devgrid");
    }),
    vscode.commands.registerCommand("devgrid.openDashboard", async () => {
      const url = treeDataProvider.getDashboardUrl();
      if (!url) {
        await vscode.window.showInformationMessage("DevGrid dashboard URL is not available. Check your configuration.");
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
  );

  registerAuthCommands(context, authService);

  await treeDataProvider.initialize();
  updateStatus();
}

export function deactivate(): void {
  statusBarItem?.dispose();
  statusBarItem = undefined;
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
