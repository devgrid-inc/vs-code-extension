import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityResolver } from '../../services/EntityResolver';
import type { ILogger } from '../../interfaces/ILogger';
import type { IGraphQLClient } from '../../interfaces/IGraphQLClient';
import type { IGitService } from '../../interfaces/IGitService';

describe('EntityResolver', () => {
  let entityResolver: EntityResolver;
  let mockLogger: ILogger;
  let mockGraphQLClient: IGraphQLClient;
  let mockGitService: IGitService;

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
      deriveRepositorySlug: vi.fn(),
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
});
