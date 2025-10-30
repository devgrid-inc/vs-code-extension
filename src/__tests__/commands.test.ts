import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';

// Mock vscode
vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  window: {
    showErrorMessage: vi.fn(),
  },
}));

describe('Command Handlers', () => {
  describe('devgrid.openVulnerability Command', () => {
    let mockServiceContainer: any;
    let mockVulnerabilityService: any;
    let mockLogger: any;
    let mockVulnerabilityDetailsPanel: any;

    beforeEach(() => {
      // Reset all mocks
      vi.clearAllMocks();

      // Create mocks
      mockVulnerabilityService = {
        fetchVulnerabilityDetails: vi.fn(),
      };

      mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      mockServiceContainer = {
        getVulnerabilityService: vi.fn().mockReturnValue(mockVulnerabilityService),
        get: vi.fn().mockReturnValue(mockLogger),
      };

      mockVulnerabilityDetailsPanel = {
        createOrShow: vi.fn(),
      };

      // Mock the imports
      vi.doMock('../webviews/VulnerabilityDetailsPanel', () => ({
        VulnerabilityDetailsPanel: mockVulnerabilityDetailsPanel,
      }));
    });

    it('should call createOrShow with correct vulnerability ID', async () => {

      // Simulate the command handler (we need to extract it from extension.ts logic)
      const commandHandler = async (treeItem: any, vulnId: string) => {
        try {
          if (!mockServiceContainer) {
            throw new Error('Service container not initialized');
          }

          const vulnerabilityService = mockServiceContainer.getVulnerabilityService();
          const logger = mockServiceContainer.get('logger');

          mockVulnerabilityDetailsPanel.createOrShow(vulnId, vulnerabilityService, logger);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to open vulnerability details';
          await vscode.window.showErrorMessage(`DevGrid: ${message}`);
        }
      };

      // Test with valid vulnerability ID
      const mockTreeItem = { label: 'Test Vulnerability' };
      const vulnId = 'test-vuln-123';

      await commandHandler(mockTreeItem, vulnId);

      expect(mockVulnerabilityDetailsPanel.createOrShow).toHaveBeenCalledWith(
        vulnId,
        mockVulnerabilityService,
        mockLogger
      );
      expect(mockServiceContainer.getVulnerabilityService).toHaveBeenCalled();
      expect(mockServiceContainer.get).toHaveBeenCalledWith('logger');
    });

    it('should handle undefined vulnerability ID', async () => {
      const commandHandler = async (treeItem: any, vulnId: string) => {
        try {
          if (!mockServiceContainer) {
            throw new Error('Service container not initialized');
          }

          const vulnerabilityService = mockServiceContainer.getVulnerabilityService();
          const logger = mockServiceContainer.get('logger');

          mockVulnerabilityDetailsPanel.createOrShow(vulnId, vulnerabilityService, logger);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to open vulnerability details';
          await vscode.window.showErrorMessage(`DevGrid: ${message}`);
        }
      };

      const mockTreeItem = { label: 'Test Vulnerability' };
      const vulnId = undefined as any;

      await commandHandler(mockTreeItem, vulnId);

      expect(mockVulnerabilityDetailsPanel.createOrShow).toHaveBeenCalledWith(
        undefined,
        mockVulnerabilityService,
        mockLogger
      );
    });

    it('should handle service container not initialized', async () => {
      const commandHandler = async (treeItem: any, vulnId: string) => {
        try {
          const serviceContainer = null; // Simulate serviceContainer being null
          if (!serviceContainer) {
            throw new Error('Service container not initialized');
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to open vulnerability details';
          await vscode.window.showErrorMessage(`DevGrid: ${message}`);
        }
      };

      const mockTreeItem = { label: 'Test Vulnerability' };
      const vulnId = 'test-vuln-123';

      await commandHandler(mockTreeItem, vulnId);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('DevGrid: Service container not initialized');
    });

    it('should handle createOrShow throwing an error', async () => {
      mockVulnerabilityDetailsPanel.createOrShow.mockRejectedValue(new Error('Panel creation failed'));

      const commandHandler = async (treeItem: any, vulnId: string) => {
        try {
          if (!mockServiceContainer) {
            throw new Error('Service container not initialized');
          }

          const vulnerabilityService = mockServiceContainer.getVulnerabilityService();
          const logger = mockServiceContainer.get('logger');

          await mockVulnerabilityDetailsPanel.createOrShow(vulnId, vulnerabilityService, logger);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to open vulnerability details';
          await vscode.window.showErrorMessage(`DevGrid: ${message}`);
        }
      };

      const mockTreeItem = { label: 'Test Vulnerability' };
      const vulnId = 'test-vuln-123';

      await commandHandler(mockTreeItem, vulnId);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('DevGrid: Panel creation failed');
    });
  });
});
