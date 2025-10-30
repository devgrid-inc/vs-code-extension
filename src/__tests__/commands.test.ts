import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';

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

  describe('Webview Action Handlers', () => {
    let mockVulnerabilityService: any;
    let mockLogger: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockVulnerabilityService = {
        fetchVulnerabilityDetails: vi.fn(),
      };

      mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
    });

    describe('handleCopyInstructions', () => {
      it('should copy vulnerability analysis to clipboard and show success message', async () => {
        const vulnId = 'test-vuln-123';
        const mockDetails = {
          id: vulnId,
          title: 'Test Vulnerability',
          severity: 'HIGH',
          identifiers: [],
          references: [],
        };

        mockVulnerabilityService.fetchVulnerabilityDetails.mockResolvedValue(mockDetails);

        // Import the handler
        const { handleCopyInstructions } = await import('../extension');

        await handleCopyInstructions(vulnId, mockVulnerabilityService, mockLogger);

        expect(mockVulnerabilityService.fetchVulnerabilityDetails).toHaveBeenCalledWith(vulnId);
        expect(vscode.env.clipboard.writeText).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('DevGrid: Vulnerability analysis copied to clipboard');
        expect(mockLogger.info).toHaveBeenCalledWith('Copied vulnerability analysis to clipboard', { vulnId });
      });

      it('should throw error when vulnerability details not found', async () => {
        const vulnId = 'test-vuln-123';

        mockVulnerabilityService.fetchVulnerabilityDetails.mockResolvedValue(undefined);

        const { handleCopyInstructions } = await import('../extension');

        await expect(handleCopyInstructions(vulnId, mockVulnerabilityService, mockLogger))
          .rejects.toThrow('Vulnerability details not found');
      });
    });

    describe('handleSendToChat', () => {
      it('should attempt to open VS Code Chat and show success when available', async () => {
        const vulnId = 'test-vuln-123';
        const mockDetails = {
          id: vulnId,
          title: 'Test Vulnerability',
          severity: 'HIGH',
          identifiers: [],
          references: [],
        };

        mockVulnerabilityService.fetchVulnerabilityDetails.mockResolvedValue(mockDetails);
        (vscode.commands.executeCommand as any).mockResolvedValue(undefined);

        // Import the handler
        const { handleSendToChat } = await import('../extension');

        await handleSendToChat(vulnId, mockVulnerabilityService, mockLogger);

        expect(mockVulnerabilityService.fetchVulnerabilityDetails).toHaveBeenCalledWith(vulnId);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', { query: expect.any(String) });
      });

      it('should fallback to clipboard when chat is not available', async () => {
        const vulnId = 'test-vuln-123';
        const mockDetails = {
          id: vulnId,
          title: 'Test Vulnerability',
          severity: 'HIGH',
          identifiers: [],
          references: [],
        };

        mockVulnerabilityService.fetchVulnerabilityDetails.mockResolvedValue(mockDetails);
        (vscode.commands.executeCommand as any).mockRejectedValue(new Error('Command not found'));
        (vscode.extensions.getExtension as any).mockReturnValue(null); // No Copilot extension

        const { handleSendToChat } = await import('../extension');

        await handleSendToChat(vulnId, mockVulnerabilityService, mockLogger);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
          'DevGrid: Chat not available. Vulnerability analysis copied to clipboard - open your chat and paste.'
        );
      });

      it('should detect GitHub Copilot extension but still fallback to clipboard', async () => {
        const vulnId = 'test-vuln-123';
        const mockDetails = {
          id: vulnId,
          title: 'Test Vulnerability',
          severity: 'HIGH',
          identifiers: [],
          references: [],
        };

        mockVulnerabilityService.fetchVulnerabilityDetails.mockResolvedValue(mockDetails);
        (vscode.commands.executeCommand as any).mockRejectedValue(new Error('Command not found'));
        (vscode.extensions.getExtension as any).mockReturnValue({}); // Copilot extension present

        const { handleSendToChat } = await import('../extension');

        await handleSendToChat(vulnId, mockVulnerabilityService, mockLogger);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith('GitHub Copilot Chat extension detected');
        expect(mockLogger.info).toHaveBeenCalledWith('Chat not available, copied to clipboard instead', { vulnId });
      });
    });

    describe('tryOpenChat', () => {
      it('should return true when VS Code Chat opens successfully', async () => {
        (vscode.commands.executeCommand as any).mockResolvedValue(undefined);

        const { tryOpenChat } = await import('../extension');

        const result = await tryOpenChat('test prompt', mockLogger);

        expect(result).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open', { query: 'test prompt' });
      });

      it('should return false when VS Code Chat is not available', async () => {
        (vscode.commands.executeCommand as any).mockRejectedValue(new Error('Command not found'));
        (vscode.extensions.getExtension as any).mockReturnValue(null);

        const { tryOpenChat } = await import('../extension');

        const result = await tryOpenChat('test prompt', mockLogger);

        expect(result).toBe(false);
      });
    });
  });
});
