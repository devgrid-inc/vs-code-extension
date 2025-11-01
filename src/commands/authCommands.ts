import * as vscode from 'vscode';

import type { AuthService } from '../authService';
import { hasValidYamlConfig } from '../utils/yamlValidator';

export function registerAuthCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  onAuthChange?: () => Promise<void>
): void {
  const signInCommand = vscode.commands.registerCommand('devgrid.signIn', async () => {
    try {
      const session = await authService.signIn();
      if (session) {
        await vscode.window.showInformationMessage(`Welcome, ${session.account.label}!`);
        if (onAuthChange) {
          await onAuthChange();
        }

        // Check for YAML config after successful authentication
        void checkAndPromptForYaml();
      }
    } catch (error) {
      await vscode.window.showErrorMessage(`Failed to sign in: ${String(error)}`);
    }
  });

  const signOutCommand = vscode.commands.registerCommand('devgrid.signOut', async () => {
    const authenticated = await authService.isAuthenticated();
    if (!authenticated) {
      await vscode.window.showInformationMessage('You are not signed in to DevGrid.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage('Sign out of DevGrid?', 'Yes', 'No');
    if (confirm !== 'Yes') {
      return;
    }

    try {
      await authService.signOut();
      await vscode.window.showInformationMessage('Signed out of DevGrid.');
      if (onAuthChange) {
        await onAuthChange();
      }
    } catch (error) {
      await vscode.window.showErrorMessage(`Failed to sign out: ${String(error)}`);
    }
  });

  const showAccountCommand = vscode.commands.registerCommand('devgrid.showAccount', async () => {
    const authenticated = await authService.isAuthenticated();
    if (!authenticated) {
      const action = await vscode.window.showInformationMessage(
        'You are not signed in to DevGrid.',
        'Sign In'
      );
      if (action === 'Sign In') {
        await vscode.commands.executeCommand('devgrid.signIn');
      }
      return;
    }

    const account = await authService.getAccount();
    if (account) {
      await vscode.window.showInformationMessage(`Signed in as ${account.label}`);
    } else {
      await vscode.window.showInformationMessage('Signed in (account details unavailable).');
    }
  });

  context.subscriptions.push(signInCommand, signOutCommand, showAccountCommand);
}

/**
 * Checks for YAML config and shows gentle prompt if missing
 */
async function checkAndPromptForYaml(): Promise<void> {
  try {
    const hasYaml = await hasValidYamlConfig();
    if (!hasYaml) {
      // Show gentle notification with options
      const action = await vscode.window.showInformationMessage(
        'DevGrid: No devgrid.yml found. Would you like help setting one up?',
        'Create Template',
        'View Guide',
        'Dismiss'
      );

      if (action === 'Create Template') {
        await vscode.commands.executeCommand('devgrid.createYamlTemplate');
      } else if (action === 'View Guide') {
        await vscode.commands.executeCommand('devgrid.openSetupGuide');
      }
    }
  } catch (error) {
    // Silently fail - this is a non-critical check
    const outputChannel = vscode.window.createOutputChannel('DevGrid');
    outputChannel.appendLine(
      `[DevGrid] YAML check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
