import * as vscode from 'vscode';

import { DevGridAuthProvider } from './authProvider';
import { AuthService } from './authService';
import { registerAuthCommands } from './commands/authCommands';
import { DevGridTreeDataProvider } from './devgridTreeDataProvider';
import type { ILogger } from './interfaces/ILogger';
import { ServiceContainer } from './services/ServiceContainer';
import { VulnerabilityService } from './services/VulnerabilityService';
import { buildRemediationPrompt } from './utils/promptUtils';
import { validateApiUrl, isValidVulnerabilityId } from './utils/validation';
import { VulnerabilityDetailsPanel } from './webviews/VulnerabilityDetailsPanel';

interface WebviewMessage {
  type: 'copyInstructions' | 'sendToChat';
}

let statusBarItem: vscode.StatusBarItem | undefined;
let serviceContainer: ServiceContainer | undefined;

/**
 * Handles copying vulnerability remediation instructions to clipboard
 */
async function handleCopyInstructions(
  vulnId: string,
  vulnerabilityService: VulnerabilityService,
  logger: ILogger
): Promise<void> {
  logger.info('Handling copy instructions request', { vulnId });

  const details = await vulnerabilityService.fetchVulnerabilityDetails(vulnId);
  if (!details) {
    throw new Error('Vulnerability details not found');
  }

  const prompt = buildRemediationPrompt(details);
  await vscode.env.clipboard.writeText(prompt);

  await vscode.window.showInformationMessage('DevGrid: Vulnerability analysis copied to clipboard');
  logger.info('Copied vulnerability analysis to clipboard', { vulnId });
}

/**
 * Handles sending vulnerability remediation instructions to chat
 */
async function handleSendToChat(
  vulnId: string,
  vulnerabilityService: VulnerabilityService,
  logger: ILogger
): Promise<void> {
  logger.info('Handling send to chat request', { vulnId });

  const details = await vulnerabilityService.fetchVulnerabilityDetails(vulnId);
  if (!details) {
    throw new Error('Vulnerability details not found');
  }

  const prompt = buildRemediationPrompt(details);

  // Try to send to chat - check for available chat commands
  const chatOpened = await tryOpenChat(prompt, logger);

  if (!chatOpened) {
    // Fallback: copy to clipboard and notify user
    await vscode.env.clipboard.writeText(prompt);
    await vscode.window.showInformationMessage(
      'DevGrid: Chat not available. Vulnerability analysis copied to clipboard - open your chat and paste.'
    );
    logger.info('Chat not available, copied to clipboard instead', { vulnId });
  }
}

/**
 * Attempts to open a chat with the given prompt
 */
async function tryOpenChat(prompt: string, logger: ILogger): Promise<boolean> {
  try {
    // Try VS Code Chat first
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
      logger.info('Opened VS Code Chat with vulnerability prompt');
      return true;
    } catch (error) {
      logger.debug('VS Code Chat not available', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Try GitHub Copilot Chat
    try {
      // Check if Copilot extension is available
      const copilotExtension = vscode.extensions.getExtension('GitHub.copilot-chat');
      if (copilotExtension) {
        logger.debug('GitHub Copilot Chat extension detected');
        // Note: We can't directly set the prompt in Copilot Chat via command,
        // so we'll copy to clipboard as fallback
        return false; // Return false so it falls back to clipboard
      }
    } catch (error) {
      logger.debug('GitHub Copilot Chat not available', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.debug('No compatible chat provider found');
    return false;
  } catch (error) {
    logger.warn('Error trying to open chat', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export { handleCopyInstructions, handleSendToChat, tryOpenChat };

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    console.log('[DevGrid] Extension activation started');

    const outputChannel = vscode.window.createOutputChannel('DevGrid');
    outputChannel.appendLine('[DevGrid] Extension activation started');

    // Initialize service container
    try {
      serviceContainer = new ServiceContainer(outputChannel);
      outputChannel.appendLine('[DevGrid] Service container initialized');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to initialize service container: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }

    // Initialize auth provider
    let authProvider: DevGridAuthProvider;
    let providerRegistration: vscode.Disposable;
    try {
      authProvider = new DevGridAuthProvider(context.secrets, outputChannel);
      providerRegistration = vscode.authentication.registerAuthenticationProvider(
        DevGridAuthProvider.id,
        'DevGrid',
        authProvider,
        { supportsMultipleAccounts: false }
      );
      outputChannel.appendLine('[DevGrid] Authentication provider registered');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to register authentication provider: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }

    // Initialize auth service and tree data provider
    const authService = new AuthService(authProvider);
    const treeDataProvider = new DevGridTreeDataProvider(outputChannel, authService);

    // Create tree view
    let treeView: vscode.TreeView<any>;
    try {
      treeView = vscode.window.createTreeView('devgridInsights', {
        treeDataProvider,
        showCollapseAll: true,
      });
      outputChannel.appendLine('[DevGrid] Tree view created');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to create tree view: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }

    // Create status bar item
    try {
      statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      statusBarItem.command = 'devgrid.refresh';
      statusBarItem.text = 'DevGrid: Initializing…';
      statusBarItem.show();
      outputChannel.appendLine('[DevGrid] Status bar initialized');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to create status bar: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw here - status bar is not critical
    }

    const updateStatus = async () => {
      try {
        await updateStatusBar(treeDataProvider, authService);
      } catch (error) {
        outputChannel.appendLine(
          `[DevGrid] Failed to update status bar: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };

    // Register subscriptions with error handling
    try {
      context.subscriptions.push(
        treeView,
        outputChannel,
        statusBarItem,
        providerRegistration,

        // Ensure sign-in command is always available (defensive duplicate of authCommands)
        vscode.commands.registerCommand('devgrid.signIn', async () => {
          try {
            await authService.signIn();
            await updateStatus();
            await treeDataProvider.refresh();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Sign-in failed: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Failed to sign in: ${message}`);
          }
        }),

        // Config watcher
        createConfigWatcher(treeDataProvider, () => {
          void updateStatus();
        }),

        // Configuration change listener
        vscode.workspace.onDidChangeConfiguration(event => {
          if (event.affectsConfiguration('devgrid')) {
            void treeDataProvider
              .refresh()
              .then(() => {
                void updateStatus();
              })
              .catch(error => {
                outputChannel.appendLine(
                  `[DevGrid] Failed to refresh after config change: ${error instanceof Error ? error.message : String(error)}`
                );
              });
          }
        }),

        // Authentication session change listener
        vscode.authentication.onDidChangeSessions(event => {
          if (event.provider.id === DevGridAuthProvider.id) {
            void treeDataProvider
              .refresh()
              .then(() => {
                void updateStatus();
              })
              .catch(error => {
                outputChannel.appendLine(
                  `[DevGrid] Failed to refresh after auth change: ${error instanceof Error ? error.message : String(error)}`
                );
              });
          }
        }),

        // Refresh command
        vscode.commands.registerCommand('devgrid.refresh', async () => {
          try {
            if (statusBarItem) {
              statusBarItem.text = 'DevGrid: Refreshing…';
            }
            await treeDataProvider.refresh();
            await updateStatus();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Refresh failed: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Failed to refresh: ${message}`);
          }
        }),

        // Settings command
        vscode.commands.registerCommand('devgrid.openSettings', () => {
          void vscode.commands
            .executeCommand(
              'workbench.action.openSettings',
              '@ext:devgrid.devgrid-vscode-extension devgrid'
            )
            .catch(error => {
              outputChannel.appendLine(
                `[DevGrid] Failed to open settings: ${error instanceof Error ? error.message : String(error)}`
              );
            });
        }),

        // Dashboard command
        vscode.commands.registerCommand('devgrid.openDashboard', async () => {
          try {
            const url = treeDataProvider.getDashboardUrl();
            if (!url) {
              await vscode.window.showInformationMessage(
                'DevGrid dashboard URL is not available. Check your configuration.'
              );
              return;
            }
            await vscode.env.openExternal(vscode.Uri.parse(url));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Failed to open dashboard: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Failed to open dashboard: ${message}`);
          }
        }),

        vscode.commands.registerCommand('devgrid.openVulnerability', async (...args: any[]) => {
          console.log('Command handler called with args:', args);

          const extractVulnerabilityId = (arg: unknown): string | undefined => {
            if (typeof arg === 'string') {
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

            if (arg && typeof arg === 'object') {
              const candidate =
                (arg as { vulnerabilityId?: unknown }).vulnerabilityId ??
                (arg as { id?: unknown }).id ??
                (arg as { vulnId?: unknown }).vulnId;

              if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim();
              }

              const commandArgs = (arg as { command?: { arguments?: unknown[] } }).command
                ?.arguments;
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

          console.log('Extracted vulnId:', { vulnId, vulnIdType: typeof vulnId });

          if (!vulnId) {
            await vscode.window.showErrorMessage('DevGrid: No vulnerability ID provided');
            return;
          }

          if (!isValidVulnerabilityId(vulnId)) {
            await vscode.window.showErrorMessage(
              `DevGrid: Invalid vulnerability ID format: ${vulnId}`
            );
            return;
          }

          try {
            if (!serviceContainer) {
              throw new Error('Service container not initialized');
            }

            const accessToken = await authService.getAccessToken();
            if (!accessToken) {
              await vscode.window.showErrorMessage(
                'DevGrid: Sign in with DevGrid to view vulnerability details.'
              );
              return;
            }

            const devgridContext = (treeDataProvider as any)?.context;
            const contextApiBaseUrl = devgridContext?.config?.apiBaseUrl;
            const apiBaseUrl =
              typeof contextApiBaseUrl === 'string' && contextApiBaseUrl.trim().length > 0
                ? contextApiBaseUrl.trim()
                : vscode.workspace
                    .getConfiguration('devgrid')
                    .get<string>('apiBaseUrl', 'https://prod.api.devgrid.io');

            if (apiBaseUrl) {
              serviceContainer.setApiBaseUrl(validateApiUrl(apiBaseUrl));
            }

            serviceContainer.setAuthToken(accessToken);

            const vulnerabilityService = serviceContainer.getVulnerabilityService();
            const logger = serviceContainer.get('logger') as ILogger;

            // Message handler for webview actions
            const handleWebviewMessage = async (message: WebviewMessage) => {
              try {
                switch (message.type) {
                  case 'copyInstructions':
                    await handleCopyInstructions(vulnId, vulnerabilityService, logger);
                    break;
                  case 'sendToChat':
                    await handleSendToChat(vulnId, vulnerabilityService, logger);
                    break;
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await vscode.window.showErrorMessage(`DevGrid: ${errorMessage}`);
              }
            };

            VulnerabilityDetailsPanel.createOrShow(
              vulnId,
              vulnerabilityService,
              logger,
              handleWebviewMessage
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Failed to open vulnerability details';
            await vscode.window.showErrorMessage(`DevGrid: ${message}`);
          }
        })
      );

      outputChannel.appendLine('[DevGrid] Subscriptions registered');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to register subscriptions: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }

    // Register auth commands (and duplicate signIn handler defensively above)
    try {
      registerAuthCommands(context, authService);
      outputChannel.appendLine('[DevGrid] Auth commands registered');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to register auth commands: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - auth commands are not critical
    }

    // Initialize tree data provider
    try {
      await treeDataProvider.initialize();
      outputChannel.appendLine('[DevGrid] Tree data provider initialized');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Tree data provider initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - initialization can fail gracefully
    }

    // Configure the service container with the API URL from the loaded context
    try {
      const devgridContext = treeDataProvider['context'];
      const apiBaseUrl =
        devgridContext?.config?.apiBaseUrl?.trim() ||
        vscode.workspace
          .getConfiguration('devgrid')
          .get<string>('apiBaseUrl', 'https://prod.api.devgrid.io');
      if (apiBaseUrl) {
        serviceContainer?.setApiBaseUrl(validateApiUrl(apiBaseUrl));
        outputChannel.appendLine(`[DevGrid] API base URL configured: ${apiBaseUrl}`);
      }
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to configure API URL: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Update status bar
    try {
      await updateStatus();
      outputChannel.appendLine('[DevGrid] Status bar updated');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to update status bar: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // One-time post-install welcome (non-blocking)
    try {
      const seenWelcome = context.globalState.get<boolean>('devgrid.welcomeShown');
      if (!seenWelcome) {
        outputChannel.appendLine('[DevGrid] Showing welcome prompt');
        const action = await vscode.window.showInformationMessage(
          'DevGrid is ready. Sign in to bring EngOps insights into your IDE.',
          'Sign In',
          'Open DevGrid View',
          'Docs'
        );
        if (action === 'Sign In') {
          await vscode.commands.executeCommand('devgrid.signIn');
        } else if (action === 'Open DevGrid View') {
          await vscode.commands.executeCommand('workbench.view.explorer');
        } else if (action === 'Docs') {
          await vscode.env.openExternal(vscode.Uri.parse('https://devgrid.io'));
        }
        await context.globalState.update('devgrid.welcomeShown', true);
      }
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Welcome prompt failed: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - welcome is not critical
    }

    // Proactive onboarding: prompt sign-in if not authenticated (non-blocking)
    try {
      const token = await authService.getAccessToken();
      if (!token) {
        outputChannel.appendLine('[DevGrid] Showing sign-in prompt');
        const choice = await vscode.window.showInformationMessage(
          'DevGrid: Connect your workspace to see EngOps insights (sign in required).',
          'Sign In',
          'Open DevGrid View',
          'Open Settings'
        );
        if (choice === 'Sign In') {
          await vscode.commands.executeCommand('devgrid.signIn');
          await updateStatus();
        } else if (choice === 'Open DevGrid View') {
          await vscode.commands.executeCommand('workbench.view.explorer');
        } else if (choice === 'Open Settings') {
          await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:devgrid.devgrid-vscode-extension devgrid'
          );
        }
      }
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Sign-in prompt failed: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - onboarding is not critical
    }

    console.log('[DevGrid] Extension activation completed successfully');
    outputChannel.appendLine('[DevGrid] Extension activation completed successfully');
  } catch (error) {
    // Log the critical activation error
    console.error('[DevGrid] Extension activation failed:', error);
    const outputChannel = vscode.window.createOutputChannel('DevGrid');
    outputChannel.appendLine(
      `[DevGrid] Extension activation failed: ${error instanceof Error ? error.message : String(error)}`
    );

    // Show user-friendly error message
    await vscode.window.showErrorMessage(
      'DevGrid extension failed to activate. Please check the DevGrid output channel for details.'
    );

    // Re-throw to indicate activation failure
    throw error;
  }
}

export function deactivate(): void {
  statusBarItem?.dispose();
  statusBarItem = undefined;
  serviceContainer?.clear();
  serviceContainer = undefined;
}

async function updateStatusBar(
  treeDataProvider: DevGridTreeDataProvider,
  authService: AuthService
): Promise<void> {
  if (!statusBarItem) {
    return;
  }

  const authenticated = await authService.isAuthenticated();
  if (!authenticated) {
    statusBarItem.text = 'DevGrid: Sign In';
    statusBarItem.command = 'devgrid.signIn';
    return;
  }

  statusBarItem.text = treeDataProvider.getStatusText();
  statusBarItem.command = 'devgrid.refresh';
}

function createConfigWatcher(
  treeDataProvider: DevGridTreeDataProvider,
  onRefreshComplete: () => void
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher('**/devgrid.y?(a)ml');
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
