import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';

import { DevGridSetupPanel } from '../../webviews/DevGridSetupPanel';

// Mock vscode
vi.mock('vscode', () => ({
  ViewColumn: {
    One: 1,
  },
  window: {
    createWebviewPanel: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  env: {
    openExternal: vi.fn(),
  },
}));

describe('DevGridSetupPanel', () => {
  let mockWebviewPanel: any;
  let messageHandlers: Array<(message: any) => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    messageHandlers = [];

    mockWebviewPanel = {
      title: '',
      webview: {
        html: '',
        onDidReceiveMessage: vi.fn((handler) => {
          messageHandlers.push(handler);
          return { dispose: vi.fn() };
        }),
      },
      onDidDispose: vi.fn(() => ({
        dispose: vi.fn(),
      })),
      dispose: vi.fn(),
      reveal: vi.fn(),
    };

    (vscode.window.createWebviewPanel as any).mockReturnValue(mockWebviewPanel);
  });

  describe('createOrShow', () => {
    it.skip('should create a new panel when none exists', () => {
      DevGridSetupPanel.createOrShow();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'devgridSetupGuide',
        'DevGrid YAML Setup Guide',
        1,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );
    });

    it.skip('should reuse existing panel when called multiple times', () => {
      DevGridSetupPanel.createOrShow();
      DevGridSetupPanel.createOrShow();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockWebviewPanel.reveal).toHaveBeenCalledTimes(1);
    });

    it.skip('should set HTML content with setup instructions', () => {
      DevGridSetupPanel.createOrShow();

      expect(mockWebviewPanel.webview.html).toContain('DevGrid YAML Configuration Setup');
      expect(mockWebviewPanel.webview.html).toContain('Why You Need This File');
      expect(mockWebviewPanel.webview.html).toContain('Basic Structure');
      expect(mockWebviewPanel.webview.html).toContain('Field Reference');
      expect(mockWebviewPanel.webview.html).toContain('Common Patterns');
    });
  });

  describe('Message Handling', () => {
    it.skip('should handle createTemplate message', async () => {
      const onMessage = vi.fn();
      DevGridSetupPanel.createOrShow(onMessage);

      // Simulate message from webview
      const handler = messageHandlers[0];
      handler({ type: 'createTemplate' });

      expect(onMessage).toHaveBeenCalledWith({ type: 'createTemplate' });
    });

    it.skip('should handle openDocs message', async () => {
      DevGridSetupPanel.createOrShow();

      const handler = messageHandlers[0];
      handler({ type: 'openDocs' });

      expect(vscode.env.openExternal).toHaveBeenCalledWith(
        vscode.Uri.parse('https://docs.devgrid.io/docs/devgrid-project-yaml')
      );
    });

    it.skip('should handle dismiss message', () => {
      DevGridSetupPanel.createOrShow();

      const handler = messageHandlers[0];
      handler({ type: 'dismiss' });

      expect(mockWebviewPanel.dispose).toHaveBeenCalled();
    });

    it.skip('should not call onMessage when it is not provided', () => {
      DevGridSetupPanel.createOrShow(undefined);

      const handler = messageHandlers[0];
      
      // Should not throw when calling handler without onMessage
      expect(() => {
        handler({ type: 'createTemplate' });
      }).not.toThrow();
    });
  });

  describe('HTML Content', () => {
    it.skip('should include documentation link', () => {
      DevGridSetupPanel.createOrShow();

      expect(mockWebviewPanel.webview.html).toContain(
        'https://docs.devgrid.io/docs/devgrid-project-yaml'
      );
    });

    it.skip('should include YAML structure examples', () => {
      DevGridSetupPanel.createOrShow();

      const {html} = mockWebviewPanel.webview;
      expect(html).toContain('project:');
      expect(html).toContain('appId:');
      expect(html).toContain('components:');
    });

    it.skip('should include action buttons', () => {
      DevGridSetupPanel.createOrShow();

      const {html} = mockWebviewPanel.webview;
      expect(html).toContain('Create Template');
      expect(html).toContain('Open Documentation');
      expect(html).toContain('Dismiss');
    });

    it.skip('should include field reference table', () => {
      DevGridSetupPanel.createOrShow();

      const {html} = mockWebviewPanel.webview;
      expect(html).toContain('Field Reference');
      expect(html).toContain('project.appId');
      expect(html).toContain('project.components');
    });

    it.skip('should include common patterns examples', () => {
      DevGridSetupPanel.createOrShow();

      const {html} = mockWebviewPanel.webview;
      expect(html).toContain('Single Component Project');
      expect(html).toContain('Multi-Component Project');
      expect(html).toContain('With Component Dependencies');
    });
  });

  describe('Panel Lifecycle', () => {
    it.skip('should dispose panel when dismissed', () => {
      DevGridSetupPanel.createOrShow();

      // Simulate dispose event
      const disposeHandler = (mockWebviewPanel.onDidDispose as any).mock.calls[0][0];
      disposeHandler();

      expect(DevGridSetupPanel.currentPanel).toBeUndefined();
    });

    it.skip('should clean up disposables on dispose', () => {
      const panel = DevGridSetupPanel.createOrShow();
      
      // Access the current panel to test dispose
      if (DevGridSetupPanel.currentPanel) {
        DevGridSetupPanel.currentPanel.dispose();
        expect(mockWebviewPanel.dispose).toHaveBeenCalled();
      }
    });
  });
});

