import * as vscode from 'vscode';

import { DevGridAuthProvider } from './authProvider';
import { AuthService } from './authService';
import { registerAuthCommands } from './commands/authCommands';
import { DevGridTreeDataProvider, type DevGridTreeItem } from './devgridTreeDataProvider';
import type { IGraphQLClient } from './interfaces/IGraphQLClient';
import type { ILogger } from './interfaces/ILogger';
import { DiagnosticsService } from './services/DiagnosticsService';
import { ServiceContainer } from './services/ServiceContainer';
import { VirtualDocumentProvider } from './services/VirtualDocumentProvider';
import type { VulnerabilityService } from './services/VulnerabilityService';
import { buildRemediationPrompt } from './utils/promptUtils';
import { validateApiUrl, isValidVulnerabilityId } from './utils/validation';
import { VulnerabilityDetailsPanel } from './webviews/VulnerabilityDetailsPanel';

interface WebviewMessage {
  type: 'copyInstructions' | 'sendToChat';
}

let statusBarItem: vscode.StatusBarItem | undefined;
let serviceContainer: ServiceContainer | undefined;
let diagnosticsService: DiagnosticsService | undefined;
let autoRefreshTimer: NodeJS.Timeout | undefined;
let autoRefreshInProgress = false;
let autoRefreshPaused = false;

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
    const outputChannel = vscode.window.createOutputChannel('DevGrid');
    outputChannel.appendLine('[DevGrid] Extension activation started');

    // Initialize service container
    try {
      serviceContainer = new ServiceContainer(outputChannel);
      outputChannel.appendLine('[DevGrid] Service container initialized');

      // Apply log level from configuration
      const configuration = vscode.workspace.getConfiguration('devgrid');
      const logLevel = configuration.get<string>('logging.level', 'info');
      serviceContainer.setLogLevelFromString(logLevel);
      outputChannel.appendLine(`[DevGrid] Log level set to: ${logLevel}`);
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
    const treeDataProvider = new DevGridTreeDataProvider(serviceContainer, authService);

    // Initialize virtual document provider
    try {
      const virtualDocumentProvider = new VirtualDocumentProvider();
      const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(
        'devgrid',
        virtualDocumentProvider
      );
      context.subscriptions.push(providerRegistration);
      outputChannel.appendLine('[DevGrid] Virtual document provider registered');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to register virtual document provider: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - virtual document provider is not critical for extension functionality
    }

    // Initialize diagnostics service
    try {
      const logger = serviceContainer.getLogger();
      const vulnerabilityService = serviceContainer.getVulnerabilityService();
      diagnosticsService = new DiagnosticsService(vulnerabilityService, logger);
      context.subscriptions.push(diagnosticsService);
      outputChannel.appendLine('[DevGrid] Diagnostics service initialized');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Failed to initialize diagnostics service: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - diagnostics is not critical for extension functionality
    }

    // Create tree view
    let treeView: vscode.TreeView<DevGridTreeItem>;
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
        ...(statusBarItem ? [statusBarItem] : []),
        providerRegistration,

        // Config watcher
        createConfigWatcher(treeDataProvider, () => {
          void updateDiagnostics(treeDataProvider).then(() => {
            void updateStatus();
          });
        }),

        // Configuration change listener
        vscode.workspace.onDidChangeConfiguration(event => {
          if (event.affectsConfiguration('devgrid')) {
            void treeDataProvider
              .refresh()
              .then(async () => {
                await updateDiagnostics(treeDataProvider);
                await updateStatus();
              })
              .catch(error => {
                outputChannel.appendLine(
                  `[DevGrid] Failed to refresh after config change: ${error instanceof Error ? error.message : String(error)}`
                );
              });

            // Update log level if logging settings changed
            if (event.affectsConfiguration('devgrid.logging.level')) {
              const configuration = vscode.workspace.getConfiguration('devgrid');
              const logLevel = configuration.get<string>('logging.level', 'info');
              if (serviceContainer) {
                serviceContainer.setLogLevelFromString(logLevel);
                outputChannel.appendLine(`[DevGrid] Log level changed to: ${logLevel}`);
              }
            }

            // Restart auto-refresh if auto-refresh settings changed
            if (
              event.affectsConfiguration('devgrid.autoRefresh.enabled') ||
              event.affectsConfiguration('devgrid.autoRefresh.intervalMinutes')
            ) {
              startAutoRefresh(treeDataProvider, updateStatus, authService, outputChannel);
            }
          }
        }),

        // Authentication session change listener
        vscode.authentication.onDidChangeSessions(event => {
          if (event.provider.id === DevGridAuthProvider.id) {
            void treeDataProvider
              .refresh()
              .then(async () => {
                await updateDiagnostics(treeDataProvider);
                await updateStatus();
              })
              .catch(error => {
                outputChannel.appendLine(
                  `[DevGrid] Failed to refresh after auth change: ${error instanceof Error ? error.message : String(error)}`
                );
              });

            // Restart auto-refresh after auth change (ensures it runs when user signs in)
            startAutoRefresh(treeDataProvider, updateStatus, authService, outputChannel);
          }
        }),

        // Refresh command
        vscode.commands.registerCommand('devgrid.refresh', async () => {
          try {
            if (statusBarItem) {
              statusBarItem.text = 'DevGrid: Refreshing…';
            }
            await treeDataProvider.refresh();
            await updateDiagnostics(treeDataProvider);
            await updateStatus();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Refresh failed: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Failed to refresh: ${message}`);
          }
        }),

        // Settings command
        vscode.commands.registerCommand('devgrid.openSettings', async () => {
          try {
            await vscode.commands.executeCommand(
              'workbench.action.openSettings',
              '@ext:devgrid.devgrid-vscode-extension devgrid'
            );
          } catch (error) {
            outputChannel.appendLine(
              `[DevGrid] Failed to open settings: ${error instanceof Error ? error.message : String(error)}`
            );
          }
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

        // YAML Setup Guide command
        vscode.commands.registerCommand('devgrid.openSetupGuide', async () => {
          try {
            const { openSetupGuide } = await import('./commands/yamlCommands');
            await openSetupGuide();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Failed to open setup guide: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Failed to open setup guide: ${message}`);
          }
        }),

        // Create YAML Template command
        vscode.commands.registerCommand('devgrid.createYamlTemplate', async () => {
          try {
            if (!serviceContainer) {
              throw new Error('Service container not initialized');
            }

            const accessToken = await authService.getAccessToken();
            if (!accessToken) {
              await vscode.window.showErrorMessage(
                'DevGrid: Sign in with DevGrid to create a template with auto-filled values.'
              );
              // Still allow creation without API
            }

            const { createYamlTemplate } = await import('./commands/yamlCommands');

            // Get GraphQL client and logger if authenticated
            let graphqlClient: IGraphQLClient | undefined;
            let logger: ILogger | undefined;
            if (accessToken && serviceContainer) {
              const configuration = vscode.workspace.getConfiguration('devgrid');
              const apiBaseUrl = configuration.get<string>(
                'apiBaseUrl',
                'https://prod.api.devgrid.io'
              );
              serviceContainer.setApiBaseUrl(validateApiUrl(apiBaseUrl));
              serviceContainer.setAuthToken(accessToken);

              // Get services needed to create GraphQL client
              logger = serviceContainer.getLogger();
              const httpClient = serviceContainer.getHttpClientInstance();
              if (httpClient && logger) {
                const { GraphQLClient } = await import('./services/GraphQLClient');
                graphqlClient = new GraphQLClient(httpClient, logger);
                graphqlClient.setEndpoint(`${validateApiUrl(apiBaseUrl)}/graphql`);
                graphqlClient.setAuthToken(accessToken);
              }
            }

            await createYamlTemplate(graphqlClient, logger);

            // Refresh tree view after template creation
            await treeDataProvider.refresh();
            await updateDiagnostics(treeDataProvider);
            await updateStatus();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Failed to create YAML template: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Failed to create template: ${message}`);
          }
        }),

        // Clear Cache command
        vscode.commands.registerCommand('devgrid.clearCache', async () => {
          try {
            const logger = serviceContainer?.getLogger();
            logger?.info('Clearing all caches');

            // Get the client and clear caches from all services
            treeDataProvider.getClient()?.clearCaches();

            await vscode.window.showInformationMessage('DevGrid: Cache cleared successfully');
            logger?.info('All caches cleared successfully');

            // Optionally refresh the data
            const refresh = await vscode.window.showInformationMessage(
              'Would you like to refresh the data now?',
              'Yes',
              'No'
            );
            if (refresh === 'Yes') {
              await vscode.commands.executeCommand('devgrid.refresh');
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Failed to clear cache: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Failed to clear cache: ${message}`);
          }
        }),

        // Pause Auto-Refresh command
        vscode.commands.registerCommand('devgrid.pauseAutoRefresh', async () => {
          try {
            autoRefreshPaused = true;
            await vscode.window.showInformationMessage('DevGrid: Auto-refresh paused');
            outputChannel.appendLine('[DevGrid] Auto-refresh paused by user');
            await updateStatus();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Failed to pause auto-refresh: ${message}`);
            await vscode.window.showErrorMessage(
              `DevGrid: Failed to pause auto-refresh: ${message}`
            );
          }
        }),

        // Resume Auto-Refresh command
        vscode.commands.registerCommand('devgrid.resumeAutoRefresh', async () => {
          try {
            autoRefreshPaused = false;
            await vscode.window.showInformationMessage('DevGrid: Auto-refresh resumed');
            outputChannel.appendLine('[DevGrid] Auto-refresh resumed by user');

            // Restart auto-refresh
            startAutoRefresh(treeDataProvider, updateStatus, authService, outputChannel);

            // Optionally refresh immediately
            const refreshNow = await vscode.window.showInformationMessage(
              'Would you like to refresh now?',
              'Yes',
              'No'
            );
            if (refreshNow === 'Yes') {
              await vscode.commands.executeCommand('devgrid.refresh');
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Failed to resume auto-refresh: ${message}`);
            await vscode.window.showErrorMessage(
              `DevGrid: Failed to resume auto-refresh: ${message}`
            );
          }
        }),

        // Debug Git command - helps troubleshoot Git remote URL fetching
        vscode.commands.registerCommand('devgrid.debugGit', async () => {
          try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
              await vscode.window.showErrorMessage('DevGrid: No workspace folder found');
              return;
            }

            const gitService = serviceContainer?.getGitService();
            if (!gitService) {
              await vscode.window.showErrorMessage('DevGrid: Git service not available');
              return;
            }

            const logger = serviceContainer?.getLogger();
            logger?.info('Running Git diagnostics', {
              workspacePath: workspaceFolder.uri.fsPath,
            });

            // Get repository information
            const repoRoot = await gitService.getRepositoryRoot(workspaceFolder.uri.fsPath);
            const currentBranch = repoRoot
              ? await gitService.getCurrentBranch(repoRoot)
              : undefined;
            const remoteUrl = repoRoot ? await gitService.getRemoteUrl(repoRoot) : undefined;

            // Log detailed information
            logger?.info('Git diagnostics results', {
              workspacePath: workspaceFolder.uri.fsPath,
              repoRoot: repoRoot ?? '(not found)',
              currentBranch: currentBranch ?? '(not found)',
              remoteUrl: remoteUrl ?? '(not found)',
              pathEnv: process.env.PATH?.substring(0, 200),
            });

            // Show user-friendly message
            const info = [
              `**Workspace:** ${workspaceFolder.uri.fsPath}`,
              `**Repository Root:** ${repoRoot ?? '❌ Not found'}`,
              `**Current Branch:** ${currentBranch ?? '❌ Not found'}`,
              `**Remote URL:** ${remoteUrl ?? '❌ Not found'}`,
              '',
              `_Check the DevGrid output channel for more details_`,
            ].join('\n\n');

            const result = await vscode.window.showInformationMessage(
              'Git Diagnostics',
              { modal: true, detail: info },
              'Copy to Clipboard',
              'Open Output'
            );

            if (result === 'Copy to Clipboard') {
              await vscode.env.clipboard.writeText(info.replace(/\*\*/g, '').replace(/_/g, ''));
              await vscode.window.showInformationMessage('Git diagnostics copied to clipboard');
            } else if (result === 'Open Output') {
              outputChannel.show();
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[DevGrid] Git diagnostics failed: ${message}`);
            await vscode.window.showErrorMessage(`DevGrid: Git diagnostics failed: ${message}`);
          }
        }),

        vscode.commands.registerCommand('devgrid.openVulnerability', async (...args: unknown[]) => {
          const logger = serviceContainer?.getLogger();
          logger?.debug('Command handler called', { args });

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

          logger?.debug('Extracted vulnerability ID', { vulnId, vulnIdType: typeof vulnId });

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

            // Get API base URL from configuration
            const configuration = vscode.workspace.getConfiguration('devgrid');
            const apiBaseUrl = configuration.get<string>(
              'apiBaseUrl',
              'https://prod.api.devgrid.io'
            );
            serviceContainer.setApiBaseUrl(validateApiUrl(apiBaseUrl));

            serviceContainer.setAuthToken(accessToken);

            const vulnerabilityService = serviceContainer.getVulnerabilityService();
            const logger = serviceContainer.getLogger();

            // Message handler for webview actions
            const handleWebviewMessage = async (message: unknown) => {
              const msg = message as WebviewMessage;
              try {
                switch (msg.type) {
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

            // Get linkage status from tree data provider
            const linkageStatus = treeDataProvider.getLinkageStatus();
            const repositoryUrl = treeDataProvider.getRepositoryUrl();

            VulnerabilityDetailsPanel.createOrShow(
              vulnId,
              vulnerabilityService,
              logger,
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              handleWebviewMessage,
              linkageStatus,
              repositoryUrl
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

    // Register auth commands with refresh callback
    try {
      registerAuthCommands(context, authService, async () => {
        await treeDataProvider.refresh();
        await updateDiagnostics(treeDataProvider);
        await updateStatus();
      });
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
      await updateDiagnostics(treeDataProvider);
      outputChannel.appendLine('[DevGrid] Tree data provider initialized');
    } catch (error) {
      outputChannel.appendLine(
        `[DevGrid] Tree data provider initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - initialization can fail gracefully
    }

    // Configure the service container with the API URL from configuration
    try {
      const configuration = vscode.workspace.getConfiguration('devgrid');
      const apiBaseUrl = configuration.get<string>('apiBaseUrl', 'https://prod.api.devgrid.io');
      serviceContainer?.setApiBaseUrl(validateApiUrl(apiBaseUrl));
      outputChannel.appendLine(`[DevGrid] API base URL configured: ${apiBaseUrl}`);
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

    // Start auto-refresh after initialization
    startAutoRefresh(treeDataProvider, updateStatus, authService, outputChannel);

    const logger = serviceContainer?.getLogger();
    logger?.info('Extension activation completed successfully');
    outputChannel.appendLine('[DevGrid] Extension activation completed successfully');
  } catch (error) {
    // Log the critical activation error
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
  stopAutoRefresh();
  statusBarItem?.dispose();
  statusBarItem = undefined;
  diagnosticsService?.dispose();
  diagnosticsService = undefined;
  serviceContainer?.clear();
  serviceContainer = undefined;
}

/**
 * Starts the auto-refresh timer
 */
function startAutoRefresh(
  treeDataProvider: DevGridTreeDataProvider,
  updateStatus: () => Promise<void>,
  authService: AuthService,
  outputChannel: vscode.OutputChannel
): void {
  stopAutoRefresh();

  const configuration = vscode.workspace.getConfiguration('devgrid');
  const enabled = configuration.get<boolean>('autoRefresh.enabled', true);
  const intervalMinutes = configuration.get<number>('autoRefresh.intervalMinutes', 5);

  if (!enabled) {
    outputChannel.appendLine('[DevGrid] Auto-refresh disabled');
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  outputChannel.appendLine(
    `[DevGrid] Auto-refresh started (every ${intervalMinutes} minute${intervalMinutes !== 1 ? 's' : ''})`
  );

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  autoRefreshTimer = setInterval(async () => {
    if (autoRefreshInProgress) {
      outputChannel.appendLine('[DevGrid] Auto-refresh skipped (refresh already in progress)');
      return;
    }

    if (autoRefreshPaused) {
      outputChannel.appendLine('[DevGrid] Auto-refresh skipped (paused by user)');
      return;
    }

    // Check if authenticated before refreshing
    const isAuthenticated = await authService.isAuthenticated();
    if (!isAuthenticated) {
      outputChannel.appendLine('[DevGrid] Auto-refresh skipped (not authenticated)');
      return;
    }

    try {
      autoRefreshInProgress = true;
      outputChannel.appendLine('[DevGrid] Auto-refresh triggered');
      await treeDataProvider.refresh();
      await updateDiagnostics(treeDataProvider);
      await updateStatus();
      outputChannel.appendLine('[DevGrid] Auto-refresh completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`[DevGrid] Auto-refresh error: ${message}`);
    } finally {
      autoRefreshInProgress = false;
    }
  }, intervalMs);
}

/**
 * Stops the auto-refresh timer
 */
function stopAutoRefresh(): void {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
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

/**
 * Updates diagnostics based on current vulnerabilities
 */
async function updateDiagnostics(treeDataProvider: DevGridTreeDataProvider): Promise<void> {
  if (!diagnosticsService) {
    return;
  }

  try {
    const vulnerabilities = treeDataProvider.getVulnerabilities();
    if (vulnerabilities) {
      await diagnosticsService.updateDiagnostics(vulnerabilities);
    } else {
      diagnosticsService.clear();
    }
  } catch (error) {
    const logger = serviceContainer?.getLogger();
    logger?.warn('Failed to update diagnostics', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
