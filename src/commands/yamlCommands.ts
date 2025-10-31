import { promises as fs } from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import type { IGraphQLClient } from '../interfaces/IGraphQLClient';
import type { ILogger } from '../interfaces/ILogger';
import { YamlTemplateService } from '../services/YamlTemplateService';
import { findYamlConfigPath } from '../utils/yamlValidator';

/**
 * Opens the DevGrid YAML setup guide webview
 */
export async function openSetupGuide(): Promise<void> {
  const { DevGridSetupPanel } = await import('../webviews/DevGridSetupPanel');
  
  DevGridSetupPanel.createOrShow((message) => {
    if (message.type === 'createTemplate') {
      void createYamlTemplate();
    }
  });
}

/**
 * Creates a YAML template file in the workspace root
 */
export async function createYamlTemplate(
  graphqlClient?: IGraphQLClient,
  logger?: ILogger
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    await vscode.window.showErrorMessage(
      'DevGrid: No workspace folder found. Please open a workspace first.'
    );
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const repositoryRoot = await getRepositoryRoot(workspacePath);
  const projectRoot = repositoryRoot ?? workspacePath;

  // Check if file already exists
  const existingConfigPath = await findYamlConfigPath(workspaceFolder);
  if (existingConfigPath) {
    const result = await vscode.window.showWarningMessage(
      `DevGrid: A configuration file already exists at ${path.basename(existingConfigPath)}. Overwrite it?`,
      'Overwrite',
      'Cancel',
      'Open Existing'
    );

    if (result === 'Cancel') {
      return;
    }

    if (result === 'Open Existing') {
      const doc = await vscode.workspace.openTextDocument(existingConfigPath);
      await vscode.window.showTextDocument(doc);
      return;
    }
  }

  // Generate template
  try {
    let templateContent: string;
    
    if (graphqlClient && logger) {
      // Use smart template generation with API
      const templateService = new YamlTemplateService(graphqlClient, logger);
      templateContent = await templateService.generateTemplate();
    } else {
      // Use basic template without API
      templateContent = `# DevGrid Configuration
# Documentation: https://docs.devgrid.io/docs/devgrid-project-yaml
#
# IMPORTANT: Replace the ****** placeholders below with actual values from the DevGrid app.
# Get these values by:
#   1. Go to https://app.devgrid.io
#   2. Navigate to your Application → Components
#   3. Copy the appId and component shortId values

project:
  appId: "******"  # Replace with your application ID from DevGrid app
  components:
  - name: my-component  # Replace with your component name
    shortId: "******"   # Replace with component short ID from DevGrid app
    manifest: package.json  # Update if your manifest file has a different name
    # api: swagger.yml  # Optional: Path to API definition
`;
    }

    // Determine file path
    const configPath = path.join(projectRoot, 'devgrid.yml');

    // Write file
    await fs.writeFile(configPath, templateContent, 'utf8');

    // Show success message
    await vscode.window.showInformationMessage(
      `DevGrid: Configuration file created. Please replace ****** placeholders with values from DevGrid app.`
    );

    // Always open the file in editor
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to create template';
    await vscode.window.showErrorMessage(
      `DevGrid: Failed to create configuration file: ${errorMessage}`
    );
  }
}

/**
 * Gets repository root from workspace path
 */
async function getRepositoryRoot(workspacePath: string): Promise<string | undefined> {
  try {
    const { getRepositoryRoot } = await import('../gitUtils');
    return await getRepositoryRoot(workspacePath);
  } catch {
    return undefined;
  }
}

