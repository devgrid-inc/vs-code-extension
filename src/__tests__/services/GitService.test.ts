import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ILogger } from '../../interfaces/ILogger';
import { GitService } from '../../services/GitService';

// Mock child_process module
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock urlUtils module
vi.mock('../../utils/urlUtils', () => ({
  deriveRepositorySlug: vi.fn(),
}));

describe('GitService', () => {
  let gitService: GitService;
  let mockLogger: ILogger;
  let mockExecFile: any;
  let mockDeriveRepositorySlug: any;

  beforeEach(async () => {
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

    // Get mocked modules
    const childProcess = await import('child_process');
    mockExecFile = vi.mocked(childProcess.execFile);

    const urlUtils = await import('../../utils/urlUtils');
    mockDeriveRepositorySlug = vi.mocked(urlUtils.deriveRepositorySlug);

    gitService = new GitService(mockLogger);
  });

  describe('getRepositoryRoot', () => {
    it('should return repository root on successful git command', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '/path/to/repo\n', stderr: '' });
      });

      const result = await gitService.getRepositoryRoot('/path/to/repo/src');

      expect(result).toBeDefined();
      expect(result).toContain('repo');
    });

    it('should return undefined when git command fails', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(new Error('Not a git repository'), { stdout: '', stderr: 'fatal: not a git repository' });
      });

      const result = await gitService.getRepositoryRoot('/not/a/repo');

      expect(result).toBeUndefined();
      // Note: logger.debug is not called because runGit silently returns undefined on errors
    });

    it('should normalize the repository root path', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '/path/to/repo\n', stderr: '' });
      });

      const result = await gitService.getRepositoryRoot('/path/to/repo/src');

      expect(result).toBeDefined();
      // Path should be normalized
      expect(result).toBe('/path/to/repo');
    });

    it('should handle empty git output', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await gitService.getRepositoryRoot('/path');

      expect(result).toBeUndefined();
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name on successful git command', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: 'main\n', stderr: '' });
      });

      const result = await gitService.getCurrentBranch('/path/to/repo');

      expect(result).toBe('main');
    });

    it('should return undefined when git command fails', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(new Error('Git error'), { stdout: '', stderr: 'fatal: git error' });
      });

      const result = await gitService.getCurrentBranch('/not/a/repo');

      expect(result).toBeUndefined();
      // Note: logger.debug is not called because runGit silently returns undefined on errors
    });

    it('should handle different branch names', async () => {
      const branchNames = ['main', 'master', 'develop', 'feature/new-feature', 'bugfix/fix-123'];

      for (const branchName of branchNames) {
        mockExecFile.mockImplementation((cmd, args, options, callback) => {
          callback(null, { stdout: `${branchName}\n`, stderr: '' });
        });

        const result = await gitService.getCurrentBranch('/path/to/repo');

        expect(result).toBe(branchName);
      }
    });

    it('should trim whitespace from branch name', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '  main  \n', stderr: '' });
      });

      const result = await gitService.getCurrentBranch('/path/to/repo');

      expect(result).toBe('main');
    });
  });

  describe('getRemoteUrl', () => {
    it('should return remote URL on successful git command', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: 'https://github.com/user/repo.git\n', stderr: '' });
      });

      const result = await gitService.getRemoteUrl('/path/to/repo');

      expect(result).toBe('https://github.com/user/repo.git');
    });

    it('should default to origin remote', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        expect(args).toContain('origin');
        callback(null, { stdout: 'https://github.com/user/repo.git\n', stderr: '' });
      });

      await gitService.getRemoteUrl('/path/to/repo');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['remote', 'get-url', 'origin'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should support custom remote names', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        expect(args).toContain('upstream');
        callback(null, { stdout: 'https://github.com/upstream/repo.git\n', stderr: '' });
      });

      const result = await gitService.getRemoteUrl('/path/to/repo', 'upstream');

      expect(result).toBe('https://github.com/upstream/repo.git');
    });

    it('should return undefined when remote does not exist', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(new Error('No such remote'), { stdout: '', stderr: 'fatal: No such remote' });
      });

      const result = await gitService.getRemoteUrl('/path/to/repo', 'nonexistent');

      expect(result).toBeUndefined();
      // Note: logger.debug is not called because runGit silently returns undefined on errors
    });

    it('should handle SSH URLs', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: 'git@github.com:user/repo.git\n', stderr: '' });
      });

      const result = await gitService.getRemoteUrl('/path/to/repo');

      expect(result).toBe('git@github.com:user/repo.git');
    });

    it('should trim whitespace from URL', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(null, { stdout: '  https://github.com/user/repo.git  \n', stderr: '' });
      });

      const result = await gitService.getRemoteUrl('/path/to/repo');

      expect(result).toBe('https://github.com/user/repo.git');
    });
  });

  describe('deriveRepositorySlug', () => {
    it('should derive repository slug from remote URL', () => {
      mockDeriveRepositorySlug.mockReturnValue('user/repo');

      const result = gitService.deriveRepositorySlug('https://github.com/user/repo.git');

      expect(result).toBe('user/repo');
      expect(mockDeriveRepositorySlug).toHaveBeenCalledWith('https://github.com/user/repo.git');
    });

    it('should return undefined for empty remote URL', () => {
      const result = gitService.deriveRepositorySlug('');

      expect(result).toBeUndefined();
      expect(mockDeriveRepositorySlug).not.toHaveBeenCalled();
    });

    it('should return undefined for undefined remote URL', () => {
      const result = gitService.deriveRepositorySlug(undefined);

      expect(result).toBeUndefined();
      expect(mockDeriveRepositorySlug).not.toHaveBeenCalled();
    });

    it('should handle errors from deriveRepositorySlug utility', () => {
      mockDeriveRepositorySlug.mockImplementation(() => {
        throw new Error('Invalid URL format');
      });

      const result = gitService.deriveRepositorySlug('invalid-url');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to derive repository slug',
        expect.objectContaining({
          remoteUrl: 'invalid-url',
        })
      );
    });

    it('should derive slug from various URL formats', () => {
      const testCases = [
        { url: 'https://github.com/user/repo.git', expected: 'user/repo' },
        { url: 'git@github.com:user/repo.git', expected: 'user/repo' },
        { url: 'https://gitlab.com/user/repo', expected: 'user/repo' },
      ];

      testCases.forEach(({ url, expected }) => {
        mockDeriveRepositorySlug.mockReturnValue(expected);

        const result = gitService.deriveRepositorySlug(url);

        expect(result).toBe(expected);
      });
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully in git commands', async () => {
      mockExecFile.mockImplementation((cmd, args, options, callback) => {
        callback(new Error('Git error'), { stdout: '', stderr: 'fatal: error' });
      });

      const repoResult = await gitService.getRepositoryRoot('/path');
      const branchResult = await gitService.getCurrentBranch('/path');
      const remoteResult = await gitService.getRemoteUrl('/path');

      expect(repoResult).toBeUndefined();
      expect(branchResult).toBeUndefined();
      expect(remoteResult).toBeUndefined();
      // runGit silently catches errors and returns undefined
    });

    it('should handle non-Error objects in deriveRepositorySlug', () => {
      mockDeriveRepositorySlug.mockImplementation(() => {
        throw 'string error';
      });

      const result = gitService.deriveRepositorySlug('invalid-url');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });
});

