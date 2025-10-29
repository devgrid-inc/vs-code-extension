import * as vscode from "vscode";
import { DevGridTreeDataProvider } from "./devgridTreeDataProvider";
import { DevGridSecretStorage } from "./secretStorage";

let statusBarItem: vscode.StatusBarItem | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("DevGrid");
  const secretStorage = new DevGridSecretStorage(context);
  const treeDataProvider = new DevGridTreeDataProvider(outputChannel, secretStorage);

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
    createConfigWatcher(treeDataProvider, updateStatus),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("devgrid")) {
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
    vscode.commands.registerCommand("devgrid.setApiKey", async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your DevGrid API key",
        placeHolder: "dg_...",
        password: true,
        ignoreFocusOut: true,
        title: "DevGrid API Key",
      });
      if (!apiKey) {
        return;
      }
      await secretStorage.setApiKey(apiKey.trim());
      await vscode.window.showInformationMessage("DevGrid API key saved to secure storage.");
      await treeDataProvider.refresh();
      updateStatus();
    }),
    vscode.commands.registerCommand("devgrid.clearApiKey", async () => {
      const confirmation = await vscode.window.showWarningMessage(
        "Remove the stored DevGrid API key?",
        { modal: true, detail: "You will need to set a new key before insights can be refreshed." },
        "Remove",
      );
      if (confirmation !== "Remove") {
        return;
      }
      await secretStorage.clearApiKey();
      await vscode.window.showInformationMessage("DevGrid API key removed.");
      await treeDataProvider.refresh();
      updateStatus();
    }),
  );

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
