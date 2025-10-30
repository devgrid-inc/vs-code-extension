import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ServiceContainer } from '../../services/ServiceContainer';

describe('ServiceContainer', () => {
  let container: ServiceContainer;
  let mockOutputChannel: { appendLine: (message: string) => void };

  beforeEach(() => {
    mockOutputChannel = {
      appendLine: vi.fn(),
    };
    container = new ServiceContainer(mockOutputChannel);
  });

  describe('createDevGridClient', () => {
    it('should create a DevGrid client with proper dependencies', () => {
      const client = container.createDevGridClient({
        apiBaseUrl: 'https://api.test.com',
        accessToken: 'test-token',
        maxItems: 50,
        endpoints: {},
        outputChannel: mockOutputChannel,
      });

      expect(client).toBeDefined();
      expect(typeof client.fetchInsights).toBe('function');
      expect(typeof client.getStatusText).toBe('function');
      expect(typeof client.getDashboardUrl).toBe('function');
    });
  });
});
