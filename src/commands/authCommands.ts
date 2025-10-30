import * as vscode from "vscode";

import type { AuthService } from "../authService";

export function registerAuthCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  onAuthChange?: () => Promise<void>,
): void {
  const signInCommand = vscode.commands.registerCommand("devgrid.signIn", async () => {
    try {
      const session = await authService.signIn();
      if (session) {
        await vscode.window.showInformationMessage(`Welcome, ${session.account.label}!`);
        if (onAuthChange) {
          await onAuthChange();
        }
      }
    } catch (error) {
      await vscode.window.showErrorMessage(`Failed to sign in: ${String(error)}`);
    }
  });

  const signOutCommand = vscode.commands.registerCommand("devgrid.signOut", async () => {
    const authenticated = await authService.isAuthenticated();
    if (!authenticated) {
      await vscode.window.showInformationMessage("You are not signed in to DevGrid.");
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      "Sign out of DevGrid?",
      "Yes",
      "No",
    );
    if (confirm !== "Yes") {
      return;
    }

    try {
      await authService.signOut();
      await vscode.window.showInformationMessage("Signed out of DevGrid.");
      if (onAuthChange) {
        await onAuthChange();
      }
    } catch (error) {
      await vscode.window.showErrorMessage(`Failed to sign out: ${String(error)}`);
    }
  });

  const showAccountCommand = vscode.commands.registerCommand("devgrid.showAccount", async () => {
    const authenticated = await authService.isAuthenticated();
    if (!authenticated) {
      const action = await vscode.window.showInformationMessage(
        "You are not signed in to DevGrid.",
        "Sign In",
      );
      if (action === "Sign In") {
        await vscode.commands.executeCommand("devgrid.signIn");
      }
      return;
    }

    const account = await authService.getAccount();
    if (account) {
      await vscode.window.showInformationMessage(`Signed in as ${account.label}`);
    } else {
      await vscode.window.showInformationMessage("Signed in (account details unavailable).");
    }
  });

  context.subscriptions.push(signInCommand, signOutCommand, showAccountCommand);
}
