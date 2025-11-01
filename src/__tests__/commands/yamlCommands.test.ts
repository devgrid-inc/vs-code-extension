import { promises as fs } from 'fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

import { openSetupGuide, createYamlTemplate } from '../../commands/yamlCommands';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [] as any[],
    openTextDocument: vi.fn(),
  },
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showTextDocument: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: vi.fn((str: string) => ({ toString: () => str })),
  },
}));
vi.mock('fs');
vi.mock('../../gitUtils', () => ({
  getRepositoryRoot: vi.fn(() => Promise.resolve('/workspace/project')),
}));
vi.mock('../../webviews/DevGridSetupPanel', () => ({
  DevGridSetupPanel: {
    createOrShow: vi.fn(),
    currentPanel: undefined,
  },
}));
vi.mock('../../utils/yamlValidator', () => ({
  findYamlConfigPath: vi.fn(),
}));

describe('yamlCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockWorkspaceFolder = {
      uri: { fsPath: '/workspace/project' },
      name: 'project',
      index: 0,
    };
    (vscode.workspace.workspaceFolders as any) = [mockWorkspaceFolder];

    (vscode.window.showWarningMessage as any) = vi.fn();
    (vscode.window.showInformationMessage as any) = vi.fn();
    (vscode.window.showErrorMessage as any) = vi.fn();
    (vscode.workspace.openTextDocument as any) = vi.fn();
    (vscode.window.showTextDocument as any) = vi.fn();
    (vscode.env.openExternal as any) = vi.fn();
  });

  describe('openSetupGuide', () => {
    it.skip('should open the setup guide webview', async () => {
      const { DevGridSetupPanel } = await import('../../webviews/DevGridSetupPanel');

      await openSetupGuide();

      expect(DevGridSetupPanel.createOrShow).toHaveBeenCalled();
    });

    it.skip('should handle message from webview to create template', async () => {
      const { DevGridSetupPanel } = await import('../../webviews/DevGridSetupPanel');
      let onMessageHandler: ((message: any) => void) | undefined;

      (DevGridSetupPanel.createOrShow as any).mockImplementation((handler: any) => {
        onMessageHandler = handler;
      });

      // Mock createYamlTemplate command
      (vscode.commands.executeCommand as any) = vi.fn();

      await openSetupGuide();

      // Simulate message from webview
      if (onMessageHandler) {
        onMessageHandler({ type: 'createTemplate' });
      }

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('devgrid.createYamlTemplate');
    });
  });

  describe('createYamlTemplate', () => {
    beforeEach(async () => {
      const gitUtilsModule = await import('../../gitUtils');
      vi.mocked(gitUtilsModule.getRepositoryRoot).mockResolvedValue('/workspace/project');
    });

    it.skip('should show error when no workspace folder', async () => {
      (vscode.workspace.workspaceFolders as any) = undefined;

      await createYamlTemplate();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'DevGrid: No workspace folder found. Please open a workspace first.'
      );
    });

    it.skip('should create template file when no existing config', async () => {
      const yamlValidatorModule = await import('../../utils/yamlValidator');
      vi.mocked(yamlValidatorModule.findYamlConfigPath).mockResolvedValue(undefined);

      (fs.writeFile as any) = vi.fn(() => Promise.resolve());
      (vscode.window.showInformationMessage as any) = vi.fn(() => Promise.resolve(undefined));
      const mockDocument = { uri: { fsPath: '/workspace/project/devgrid.yml' } };
      (vscode.workspace.openTextDocument as any) = vi.fn(() => Promise.resolve(mockDocument));
      (vscode.window.showTextDocument as any) = vi.fn();

      await createYamlTemplate();

      const writeCall = (fs.writeFile as any).mock.calls[0];
      expect(writeCall[0]).toBe('/workspace/project/devgrid.yml');
      expect(writeCall[1]).toContain('DevGrid Configuration');
      expect(writeCall[1]).toContain('******');
      expect(writeCall[2]).toBe('utf8');
      // File should always open after creation
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
        '/workspace/project/devgrid.yml'
      );
      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDocument);
    });

    it.skip('should prompt user when config file exists', async () => {
      const yamlValidatorModule = await import('../../utils/yamlValidator');
      vi.mocked(yamlValidatorModule.findYamlConfigPath).mockResolvedValue(
        '/workspace/project/devgrid.yml'
      );

      (vscode.window.showWarningMessage as any) = vi.fn(() => Promise.resolve('Cancel'));

      await createYamlTemplate();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
        'Overwrite',
        'Cancel',
        'Open Existing'
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it.skip('should overwrite existing file when user confirms', async () => {
      const yamlValidatorModule = await import('../../utils/yamlValidator');
      vi.mocked(yamlValidatorModule.findYamlConfigPath).mockResolvedValue(
        '/workspace/project/devgrid.yml'
      );

      (vscode.window.showWarningMessage as any) = vi.fn(() => Promise.resolve('Overwrite'));
      (fs.writeFile as any) = vi.fn(() => Promise.resolve());
      (vscode.window.showInformationMessage as any) = vi.fn(() => Promise.resolve(undefined));
      const mockDocument = { uri: { fsPath: '/workspace/project/devgrid.yml' } };
      (vscode.workspace.openTextDocument as any) = vi.fn(() => Promise.resolve(mockDocument));
      (vscode.window.showTextDocument as any) = vi.fn();

      await createYamlTemplate();

      expect(fs.writeFile).toHaveBeenCalled();
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it.skip('should open existing file when user chooses', async () => {
      const existingPath = '/workspace/project/devgrid.yml';
      const yamlValidatorModule = await import('../../utils/yamlValidator');
      vi.mocked(yamlValidatorModule.findYamlConfigPath).mockResolvedValue(existingPath);

      const mockDocument = { uri: { fsPath: existingPath } };
      (vscode.window.showWarningMessage as any) = vi.fn(() => Promise.resolve('Open Existing'));
      (vscode.workspace.openTextDocument as any) = vi.fn(() => Promise.resolve(mockDocument));

      await createYamlTemplate();

      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(existingPath);
      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDocument);
    });

    it.skip('should use smart template generation when GraphQL client provided', async () => {
      const yamlValidatorModule = await import('../../utils/yamlValidator');
      vi.mocked(yamlValidatorModule.findYamlConfigPath).mockResolvedValue(undefined);

      const mockGraphQLClient = {
        query: vi.fn(),
      };
      const mockLogger = {
        debug: vi.fn(),
      };

      // Mock the YamlTemplateService
      vi.doMock('../../services/YamlTemplateService', () => ({
        YamlTemplateService: vi.fn().mockImplementation(() => ({
          generateTemplate: vi.fn(() =>
            Promise.resolve('# Auto-detected config\nproject:\n  appId: 12345')
          ),
        })),
      }));

      (fs.writeFile as any) = vi.fn(() => Promise.resolve());
      (vscode.window.showInformationMessage as any) = vi.fn(() => Promise.resolve(undefined));

      await createYamlTemplate(mockGraphQLClient as any, mockLogger as any);

      expect(fs.writeFile).toHaveBeenCalled();
      const writtenContent = (fs.writeFile as any).mock.calls[0][1];
      expect(writtenContent).toContain('project:');
    });

    it.skip('should handle file write errors', async () => {
      const yamlValidatorModule = await import('../../utils/yamlValidator');
      vi.mocked(yamlValidatorModule.findYamlConfigPath).mockResolvedValue(undefined);

      (fs.writeFile as any) = vi.fn(() => Promise.reject(new Error('Permission denied')));
      (vscode.window.showErrorMessage as any) = vi.fn();

      await createYamlTemplate();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create configuration file')
      );
    });

    it.skip('should always open file after creation', async () => {
      const yamlValidatorModule = await import('../../utils/yamlValidator');
      vi.mocked(yamlValidatorModule.findYamlConfigPath).mockResolvedValue(undefined);

      const configPath = '/workspace/project/devgrid.yml';
      const mockDocument = { uri: { fsPath: configPath } };

      (fs.writeFile as any) = vi.fn(() => Promise.resolve());
      (vscode.window.showInformationMessage as any) = vi.fn(() => Promise.resolve(undefined));
      (vscode.workspace.openTextDocument as any) = vi.fn(() => Promise.resolve(mockDocument));
      (vscode.window.showTextDocument as any) = vi.fn();

      await createYamlTemplate();

      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(configPath);
      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDocument);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Please replace ****** placeholders')
      );
    });
  });
});
