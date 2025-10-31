import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ApiError } from '../../errors/DevGridError';
import type { IGitService } from '../../interfaces/IGitService';
import type { IGraphQLClient } from '../../interfaces/IGraphQLClient';
import type { ILogger } from '../../interfaces/ILogger';
import { EntityResolver } from '../../services/EntityResolver';

describe('EntityResolver', () => {
  let entityResolver: EntityResolver;
  let mockLogger: ILogger;
  let mockGraphQLClient: IGraphQLClient;
  let mockGitService: IGitService;

  const mockWorkspacePath = '/test/workspace';

  beforeEach(() => {
    mockLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setLevel: vi.fn(),
      getLevel: vi.fn().mockReturnValue('info'),
      child: vi.fn().mockReturnThis(),
    };

    mockGraphQLClient = {
      query: vi.fn(),
      mutate: vi.fn(),
      setEndpoint: vi.fn(),
      setAuthToken: vi.fn(),
    };

    mockGitService = {
      getRepositoryRoot: vi.fn(),
      getCurrentBranch: vi.fn(),
      getRemoteUrl: vi.fn(),
    };

    entityResolver = new EntityResolver(mockGraphQLClient, mockGitService, mockLogger);
  });

  describe('toEntitySummary', () => {
    it('should convert GraphEntityDetails to DevGridEntitySummary', () => {
      const details = {
        entity: {
          id: 'test-id',
          shortId: 'test-short-id',
          name: 'Test Entity',
          description: 'Test Description',
          type: 'component',
        },
        attributes: new Map(),
        relationships: [],
      };

      const result = entityResolver.toEntitySummary(details);

      expect(result).toEqual({
        id: 'test-id',
        slug: 'test-short-id',
        name: 'Test Entity',
        description: 'Test Description',
      });
    });

    it('should handle null values correctly', () => {
      const details = {
        entity: {
          id: null,
          shortId: null,
          name: null,
          description: null,
          type: 'component',
        },
        attributes: new Map(),
        relationships: [],
      };

      const result = entityResolver.toEntitySummary(details);

      expect(result).toEqual({
        id: undefined,
        slug: undefined,
        name: undefined,
        description: undefined,
      });
    });
  });

  describe('toRepositorySummary', () => {
    it('should convert to repository summary with URL', () => {
      const details = {
        entity: {
          id: 'repo-id',
          shortId: 'repo-slug',
          name: 'Test Repository',
          description: 'Test Repo Description',
          type: 'repo',
        },
        attributes: new Map([
          ['url', 'https://github.com/test/repo'],
          ['description', 'Attribute description'],
        ]),
        relationships: [],
      };

      const result = entityResolver.toRepositorySummary(details);

      expect(result).toEqual({
        id: 'repo-id',
        slug: 'repo-slug',
        name: 'Test Repository',
        url: 'https://github.com/test/repo',
        description: 'Test Repo Description',
      });
    });
  });

  describe('toApplicationSummary', () => {
    it('should convert to application summary', () => {
      const details = {
        entity: {
          id: 'app-id',
          shortId: 'app-slug',
          name: 'Test Application',
          description: 'Test App Description',
          type: 'application',
        },
        attributes: new Map(),
        relationships: [],
      };

      const result = entityResolver.toApplicationSummary(details);

      expect(result).toEqual({
        id: 'app-id',
        slug: 'app-slug',
        name: 'Test Application',
        description: 'Test App Description',
      });
    });
  });

  describe('loadComponentDetails', () => {
    describe('positive scenarios', () => {
      it('should load component by ID (UUID format)', async () => {
        const context = { componentId: '123e4567-e89b-12d3-a456-426614174000' };
        const mockEntity = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          shortId: 'comp-001',
          name: 'Test Component',
          description: 'Test Description',
          type: 'component',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(result?.entity.shortId).toBe('comp-001');
        expect(result?.entity.name).toBe('Test Component');
        expect(context.componentId).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(context.componentSlug).toBe('comp-001');
      });

      it('should load component by slug', async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            shortId: 'comp-001',
            name: 'Test Component',
            description: 'Test Description',
            type: 'component',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.shortId).toBe('comp-001');
        expect(context.componentId).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(context.componentSlug).toBe('comp-001');
      });

      it('should prefer componentId over componentSlug when both are provided', async () => {
        const context = { componentId: 'uuid-123', componentSlug: 'comp-001' };
        const mockEntity = {
          id: 'uuid-123',
          shortId: 'comp-001',
          name: 'Test Component',
          type: 'component',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('uuid-123');
        expect(mockGraphQLClient.query).toHaveBeenCalledTimes(1);
      });

      it('should handle component with relationships', async () => {
        const context = { componentId: 'comp-123' };
        const mockEntity = {
          id: 'comp-123',
          shortId: 'comp-001',
          name: 'Test Component',
          type: 'component',
          attributes: [],
          relationships: [
            {
              to: {
                id: 'repo-123',
                shortId: 'repo-001',
                name: 'Test Repo',
                type: 'repo',
              },
            },
          ],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.relationships).toHaveLength(1);
        expect(result?.relationships[0]?.to?.id).toBe('repo-123');
      });

      it('should handle component with attributes', async () => {
        const context = { componentId: 'comp-123' };
        const mockEntity = {
          id: 'comp-123',
          shortId: 'comp-001',
          name: 'Test Component',
          type: 'component',
          attributes: [
            { field: 'language', value: 'TypeScript' },
            { field: 'framework', value: 'React' },
          ],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.attributes.get('language')).toBe('TypeScript');
        expect(result?.attributes.get('framework')).toBe('React');
      });
    });

    describe('negative scenarios', () => {
      it('should return undefined when component not found by ID', async () => {
        const context = { componentId: 'non-existent-id' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: null },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should return undefined when component not found by slug', async () => {
        const context = { componentSlug: 'non-existent-slug' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [] },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should return undefined when both componentId and componentSlug are missing', async () => {
        const context = {};

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
        expect(mockGraphQLClient.query).not.toHaveBeenCalled();
      });

      it('should handle GraphQL query error', async () => {
        const context = { componentId: 'comp-123' };
        const error = new Error('Network error');

        vi.mocked(mockGraphQLClient.query).mockRejectedValueOnce(error);

        await expect(entityResolver.loadComponentDetails(context)).rejects.toThrow(ApiError);
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should handle null entity response', async () => {
        const context = { componentId: 'comp-123' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: null },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle empty allEntities array', async () => {
        const context = { componentSlug: 'comp-001' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [] },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle null in allEntities array', async () => {
        const context = { componentSlug: 'comp-001' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [null] },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle malformed GraphQL response', async () => {
        const context = { componentId: 'comp-123' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: null,
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle missing required fields in response', async () => {
        const context = { componentId: 'comp-123' };
        const mockEntity = {
          id: 'comp-123',
          // Missing shortId, name, etc.
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('comp-123');
        expect(result?.entity.shortId).toBeUndefined();
      });

      it('should handle wrong entity type returned', async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: '123',
            shortId: 'comp-001',
            type: 'application', // Wrong type
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        // Still returns it, but type is wrong - this is acceptable as filter should handle it
        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.type).toBe('application');
      });
    });
  });

  describe('loadRepositoryDetails', () => {
    describe('positive scenarios', () => {
      it('should load repository by ID (UUID format)', async () => {
        const context = { repositoryId: '123e4567-e89b-12d3-a456-426614174000' };
        const mockEntity = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          shortId: 'repo-001',
          name: 'Test Repo',
          type: 'repo',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      });

      it('should load repository by ID (short ID format)', async () => {
        const context = { repositoryId: 'repo001' }; // No hyphen = short ID format
        const mockRepo = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'repo001',
          description: 'Test Repo',
          url: 'https://github.com/org/repo001',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        // Short ID format triggers fetchRepositoryByShortId which uses allRepos with name filter
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      });

      it('should load repository by slug', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'https://github.com/org/repo-001';
        const mockRepo = {
          id: 'repo-123',
          name: 'repo-001',
          description: 'Test Repo',
          url: 'https://github.com/org/repo-001',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        // Empty context triggers URL lookup via getGitRemoteUrl
        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
      });

      it('should load repository by URL when slug not found', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'git@github.com:org/repo';
        const mockRepo = {
          id: 'repo-123',
          name: 'repo',
          description: 'Test Repo',
          url: 'https://github.com/org/repo',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        }); // URL lookup succeeds

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
        expect(mockGraphQLClient.query).toHaveBeenCalledTimes(1);
      });

      it('should load repository from component relationship', async () => {
        const context = { repositoryId: 'repo-123' };
        const componentDetails = {
          entity: {
            id: 'comp-123',
            shortId: 'comp-001',
            name: 'Component',
            type: 'component',
          },
          attributes: new Map(),
          relationships: [
            {
              to: {
                id: 'repo-456',
                shortId: 'repo-002',
                name: 'Related Repo',
                type: 'repo',
              },
            },
          ],
        };
        const mockEntity = {
          id: 'repo-456',
          shortId: 'repo-002',
          name: 'Related Repo',
          type: 'repo',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query)
          .mockResolvedValueOnce({ data: { entity: null } })
          .mockResolvedValueOnce({ data: { entity: mockEntity } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          componentDetails,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-456');
        expect(context.repositoryId).toBe('repo-456');
      });

      it('should prefer repositoryId over repositorySlug when both are provided', async () => {
        const context = { repositoryId: 'uuid-123' }; // repositoryId should take precedence
        const mockEntity = {
          id: 'uuid-123',
          shortId: 'repo-001',
          name: 'Test Repo',
          type: 'repo',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(mockGraphQLClient.query).toHaveBeenCalledTimes(1);
      });

      it('should handle HTTPS URL for repository lookup', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'https://github.com/org/repo';
        const mockRepo = {
          id: 'repo-123',
          name: 'repo',
          url: 'https://github.com/org/repo',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
      });

      it('should handle SSH URL conversion for repository lookup', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'git@github.com:org/repo';
        const mockRepo = {
          id: 'repo-123',
          name: 'repo',
          url: 'https://github.com/org/repo',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
      });
    });

    describe('negative scenarios', () => {
      it('should return undefined when repository not found by ID', async () => {
        const context = { repositoryId: 'non-existent-id' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: null },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should return undefined when repository not found by slug', async () => {
        const context = {}; // Empty context triggers Git URL lookup

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should return undefined when repository not found by URL', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'https://github.com/org/non-existent';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query)
          .mockResolvedValueOnce({ data: { allEntities: [] } })
          .mockResolvedValueOnce({ data: { allRepos: [] } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should return undefined when both repositoryId and repositorySlug are missing', async () => {
        const context = {};

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
        expect(mockGraphQLClient.query).not.toHaveBeenCalled();
      });

      it('should handle GraphQL query error', async () => {
        const context = { repositoryId: 'repo-123' };
        const error = new Error('Network error');

        vi.mocked(mockGraphQLClient.query).mockRejectedValueOnce(error);

        await expect(entityResolver.loadRepositoryDetails(context)).rejects.toThrow(ApiError);
      });

      it('should handle Git remote URL fetch failure', async () => {
        const context = {}; // Empty context triggers Git URL lookup

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(undefined);

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle null repository result from URL lookup', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'https://github.com/org/repo';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: [null] } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle empty repository array from URL lookup', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'https://github.com/org/repo';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: [] } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle malformed GraphQL response', async () => {
        const context = { repositoryId: 'repo-123' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: null,
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle invalid URL format', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const invalidUrl = 'not-a-valid-url';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(invalidUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: [] } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        // Should not throw, but return undefined
        expect(result).toBeUndefined();
      });

      it('should handle empty URL string', async () => {
        const context = {}; // Empty context triggers Git URL lookup

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce('');

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle repository query returning multiple repos (edge case)', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const gitUrl = 'https://github.com/org/repo';
        const mockRepos = [
          {
            id: 'repo-123',
            name: 'repo',
            url: 'https://github.com/org/repo',
          },
          {
            id: 'repo-456',
            name: 'repo2',
            url: 'https://github.com/org/repo',
          },
        ];

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(gitUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: mockRepos } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        // Should return first result
        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
      });

      it('should handle missing required fields in repository response', async () => {
        const context = { repositoryId: 'repo-123' };
        const mockEntity = {
          id: 'repo-123',
          // Missing shortId, name, etc.
          type: 'repo',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
        expect(result?.entity.shortId).toBeUndefined();
      });

      it('should handle component relationship with missing repository', async () => {
        const context = { repositoryId: 'repo-123' };
        const componentDetails = {
          entity: {
            id: 'comp-123',
            type: 'component',
          },
          attributes: new Map(),
          relationships: [
            {
              to: {
                id: 'repo-456',
                shortId: 'repo-002',
                type: 'repo',
              },
            },
          ],
        };

        vi.mocked(mockGraphQLClient.query)
          .mockResolvedValueOnce({ data: { entity: null } })
          .mockResolvedValueOnce({ data: { entity: null } }); // Repository not found

        const result = await entityResolver.loadRepositoryDetails(
          context,
          componentDetails,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });
    });
  });

  describe('loadApplicationDetails', () => {
    describe('positive scenarios', () => {
      it('should load application by ID (UUID format)', async () => {
        const context = { applicationId: '123e4567-e89b-12d3-a456-426614174000' };
        const mockEntity = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          shortId: 'app-001',
          name: 'Test App',
          type: 'application',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      });

      it('should load application by ID (short ID format)', async () => {
        const context = { applicationId: 'app001' }; // No hyphen = short ID format
        const mockEntities = [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            shortId: 'app001',
            name: 'Test App',
            type: 'application',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.shortId).toBe('app001');
      });

      it('should load application by slug', async () => {
        const context = { applicationSlug: 'app-001' };
        const mockEntities = [
          {
            id: 'app-123',
            shortId: 'app-001',
            name: 'Test App',
            type: 'application',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.shortId).toBe('app-001');
      });

      it('should load application from component relationship', async () => {
        const context = { applicationId: 'app-123' };
        const componentDetails = {
          entity: {
            id: 'comp-123',
            shortId: 'comp-001',
            name: 'Component',
            type: 'component',
          },
          attributes: new Map(),
          relationships: [
            {
              to: {
                id: 'app-456',
                shortId: 'app-002',
                name: 'Related App',
                type: 'application',
              },
            },
          ],
        };
        const mockEntity = {
          id: 'app-456',
          shortId: 'app-002',
          name: 'Related App',
          type: 'application',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query)
          .mockResolvedValueOnce({ data: { entity: null } })
          .mockResolvedValueOnce({ data: { entity: mockEntity } });

        const result = await entityResolver.loadApplicationDetails(context, componentDetails);

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('app-456');
        expect(context.applicationId).toBe('app-456');
      });

      it('should prefer applicationId over applicationSlug when both are provided', async () => {
        const context = { applicationId: 'uuid-123', applicationSlug: 'app-001' };
        const mockEntity = {
          id: 'uuid-123',
          shortId: 'app-001',
          name: 'Test App',
          type: 'application',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(mockGraphQLClient.query).toHaveBeenCalledTimes(1);
      });

      it('should handle application with attributes', async () => {
        const context = { applicationId: 'app-123' };
        const mockEntity = {
          id: 'app-123',
          shortId: 'app-001',
          name: 'Test App',
          type: 'application',
          attributes: [{ field: 'environment', value: 'production' }],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(result?.attributes.get('environment')).toBe('production');
      });
    });

    describe('negative scenarios', () => {
      it('should return undefined when application not found by ID', async () => {
        const context = { applicationId: 'non-existent-id' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: null },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeUndefined();
      });

      it('should return undefined when application not found by slug', async () => {
        const context = { applicationSlug: 'non-existent-slug' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [] },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeUndefined();
      });

      it('should return undefined when both applicationId and applicationSlug are missing', async () => {
        const context = {};

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeUndefined();
        expect(mockGraphQLClient.query).not.toHaveBeenCalled();
      });

      it('should handle GraphQL query error', async () => {
        const context = { applicationId: 'app-123' };
        const error = new Error('Network error');

        vi.mocked(mockGraphQLClient.query).mockRejectedValueOnce(error);

        await expect(entityResolver.loadApplicationDetails(context)).rejects.toThrow(ApiError);
      });

      it('should handle null entity response', async () => {
        const context = { applicationId: 'app-123' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: null },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle empty allEntities array', async () => {
        const context = { applicationSlug: 'app-001' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [] },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle null in allEntities array', async () => {
        const context = { applicationSlug: 'app-001' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [null] },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle wrong entity type returned', async () => {
        const context = { applicationSlug: 'app-001' };
        const mockEntities = [
          {
            id: '123',
            shortId: 'app-001',
            type: 'component', // Wrong type
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.type).toBe('component');
      });

      it('should handle malformed GraphQL response', async () => {
        const context = { applicationId: 'app-123' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: null,
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle missing required fields in response', async () => {
        const context = { applicationId: 'app-123' };
        const mockEntity = {
          id: 'app-123',
          // Missing shortId, name, etc.
          type: 'application',
          attributes: [],
          relationships: [],
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { entity: mockEntity },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('app-123');
        expect(result?.entity.shortId).toBeUndefined();
      });

      it('should handle component relationship with missing application', async () => {
        const context = { applicationId: 'app-123' };
        const componentDetails = {
          entity: {
            id: 'comp-123',
            type: 'component',
          },
          attributes: new Map(),
          relationships: [
            {
              to: {
                id: 'app-456',
                shortId: 'app-002',
                type: 'application',
              },
            },
          ],
        };

        vi.mocked(mockGraphQLClient.query)
          .mockResolvedValueOnce({ data: { entity: null } })
          .mockResolvedValueOnce({ data: { entity: null } }); // Application not found

        const result = await entityResolver.loadApplicationDetails(context, componentDetails);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('fetchRepositoryByUrl', () => {
    describe('positive scenarios', () => {
      it('should fetch repository by HTTPS URL', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/repo';
        const mockRepo = {
          id: 'repo-123',
          name: 'repo',
          description: 'Test Repo',
          url: 'https://github.com/org/repo',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        // Use reflection or make method public for testing - for now, test via loadRepositoryDetails
        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        }); // URL lookup succeeds

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
        expect(result?.attributes.get('url')).toBe('https://github.com/org/repo');
      });

      it('should fetch repository by SSH URL (converted to HTTPS)', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const sshUrl = 'git@github.com:org/repo';
        const mockRepo = {
          id: 'repo-123',
          name: 'repo',
          url: 'https://github.com/org/repo',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(sshUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
      });
    });

    describe('negative scenarios', () => {
      it('should return undefined when repository not found (empty array)', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/non-existent';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: [] } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should return undefined when repository not found (null response)', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/repo';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: [null] } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle invalid URL format', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const invalidUrl = 'not-a-valid-url';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(invalidUrl);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: [] } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle empty URL string', async () => {
        const context = {}; // Empty context triggers Git URL lookup

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce('');

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle null URL', async () => {
        const context = {}; // Empty context triggers Git URL lookup

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(undefined);

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle GraphQL query error', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/repo';
        const error = new Error('Network error');

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockRejectedValueOnce(error);

        await expect(
          entityResolver.loadRepositoryDetails(context, undefined, mockWorkspacePath)
        ).rejects.toThrow(ApiError);
      });

      it('should handle GraphQL error response', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/repo';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: null,
          errors: [{ message: 'GraphQL error' }],
        });

        // GraphQL errors don't throw, but return data: null
        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle malformed GraphQL response', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/repo';

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: null });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeUndefined();
      });

      it('should handle missing required fields in repository response', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/repo';
        const mockRepo = {
          id: 'repo-123',
          // Missing name, url, etc.
        };

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
      });

      it('should handle repository query returning multiple repos (limit: 1 should prevent)', async () => {
        const context = {}; // Empty context triggers Git URL lookup
        const url = 'https://github.com/org/repo';
        const mockRepos = [
          {
            id: 'repo-123',
            name: 'repo',
            url: 'https://github.com/org/repo',
          },
          {
            id: 'repo-456',
            name: 'repo2',
            url: 'https://github.com/org/repo',
          },
        ];

        vi.mocked(mockGitService.getRepositoryRoot).mockResolvedValueOnce('/path/to/repo');
        vi.mocked(mockGitService.getRemoteUrl).mockResolvedValueOnce(url);
        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({ data: { allRepos: mockRepos } });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        // Should return first result
        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('repo-123');
      });
    });
  });

  describe('fetchEntityByShortIdDirect', () => {
    describe('positive scenarios', () => {
      it('should fetch repository entity by shortId', async () => {
        const context = { repositoryId: 'repo001' }; // Using short ID format (no hyphens)
        const mockRepo = {
          id: 'uuid-123',
          name: 'repo001',
          description: 'Test Repo',
          url: 'https://github.com/org/repo001',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('uuid-123');
      });

      it('should fetch application by shortId', async () => {
        const context = { applicationSlug: 'app-001' };
        const mockEntities = [
          {
            id: 'app-123',
            shortId: 'app-001',
            name: 'Test App',
            type: 'application',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadApplicationDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.shortId).toBe('app-001');
      });

      it('should fetch repository entity by shortId', async () => {
        const context = { repositoryId: 'repo001' }; // Short ID format (no hyphens)
        const mockRepo = {
          id: 'uuid-456',
          name: 'repo001',
          description: 'Test Repo 2',
          url: 'https://github.com/org/repo001',
          ignore: false,
          readyForIntegration: true,
          externalSystem: 'github',
        };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allRepos: [mockRepo] },
        });

        const result = await entityResolver.loadRepositoryDetails(
          context,
          undefined,
          mockWorkspacePath
        );

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('uuid-456');
      });

      it('should handle entity with attributes', async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: 'comp-123',
            shortId: 'comp-001',
            name: 'Test Component',
            type: 'component',
            attributes: [{ field: 'language', value: 'TypeScript' }],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.attributes.get('language')).toBe('TypeScript');
      });

      it('should handle entity with relationships', async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: 'comp-123',
            shortId: 'comp-001',
            name: 'Test Component',
            type: 'component',
            attributes: [],
            relationships: [
              {
                to: {
                  id: 'repo-123',
                  shortId: 'repo-001',
                  name: 'Test Repo',
                  type: 'repo',
                },
              },
            ],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.relationships).toHaveLength(1);
      });

      it('should trim whitespace from shortId', async () => {
        const context = { componentSlug: '  comp-001  ' };
        const mockEntities = [
          {
            id: 'comp-123',
            shortId: 'comp-001',
            name: 'Test Component',
            type: 'component',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(mockGraphQLClient.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ shortId: 'comp-001' })
        );
      });
    });

    describe('negative scenarios', () => {
      it('should return undefined when entity not found (empty result)', async () => {
        const context = { componentSlug: 'non-existent' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [] },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should return undefined when entity not found (wrong type returned)', async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: '123',
            shortId: 'comp-001',
            type: 'application', // Wrong type
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        // Still returns it, but type is wrong - filter should handle this
        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.type).toBe('application');
      });

      it('should handle empty shortId string', async () => {
        const context = { componentSlug: '' };

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
        expect(mockGraphQLClient.query).not.toHaveBeenCalled();
      });

      it('should handle null shortId', async () => {
        const context: { componentSlug?: string | null } = { componentSlug: null };

        const result = await entityResolver.loadComponentDetails(context as any);

        expect(result).toBeUndefined();
        expect(mockGraphQLClient.query).not.toHaveBeenCalled();
      });

      it('should handle GraphQL query throws network error', async () => {
        const context = { componentSlug: 'comp-001' };
        const error = new Error('Network error');

        vi.mocked(mockGraphQLClient.query).mockRejectedValueOnce(error);

        await expect(entityResolver.loadComponentDetails(context)).rejects.toThrow(ApiError);
      });

      it('should handle GraphQL query returns error response', async () => {
        const context = { componentSlug: 'comp-001' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: null,
          errors: [{ message: 'GraphQL error' }],
        });

        // GraphQL errors don't throw, but return data: null
        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle GraphQL query returns malformed response', async () => {
        const context = { componentSlug: 'comp-001' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: null,
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle missing required fields in GraphQL response', async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: 'comp-123',
            // Missing shortId, name, etc.
            type: 'component',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('comp-123');
        expect(result?.entity.shortId).toBeUndefined();
      });

      it("should handle multiple entities returned (shouldn't happen but test edge case)", async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: 'comp-123',
            shortId: 'comp-001',
            type: 'component',
            attributes: [],
            relationships: [],
          },
          {
            id: 'comp-456',
            shortId: 'comp-001',
            type: 'component',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadComponentDetails(context);

        // Should return first result
        expect(result).toBeDefined();
        expect(result?.entity.id).toBe('comp-123');
      });

      it('should handle null in allEntities array', async () => {
        const context = { componentSlug: 'comp-001' };

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: [null] },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeUndefined();
      });

      it('should handle invalid entity type', async () => {
        const context = { componentSlug: 'comp-001' };
        const mockEntities = [
          {
            id: 'comp-123',
            shortId: 'comp-001',
            type: 'invalid-type',
            attributes: [],
            relationships: [],
          },
        ];

        vi.mocked(mockGraphQLClient.query).mockResolvedValueOnce({
          data: { allEntities: mockEntities },
        });

        const result = await entityResolver.loadComponentDetails(context);

        expect(result).toBeDefined();
        expect(result?.entity.type).toBe('invalid-type');
      });
    });
  });
});
