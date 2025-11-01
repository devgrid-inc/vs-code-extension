import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

import type { IGitService } from '../interfaces/IGitService';
import type { ILogger } from '../interfaces/ILogger';

const execFileAsync = promisify(execFile);

/**
 * Git service implementation
 */
export class GitService implements IGitService {
  // eslint-disable-next-line no-useless-constructor -- TypeScript parameter properties for dependency injection
  constructor(private logger: ILogger) {}

  /**
   * Gets the repository root directory
   */
  async getRepositoryRoot(startPath: string): Promise<string | undefined> {
    try {
      const output = await this.runGit(['rev-parse', '--show-toplevel'], startPath);
      return output ? path.normalize(output) : undefined;
    } catch (error) {
      this.logger.debug('Failed to get repository root', {
        startPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Gets the current branch name
   */
  async getCurrentBranch(startPath: string): Promise<string | undefined> {
    try {
      return await this.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], startPath);
    } catch (error) {
      this.logger.debug('Failed to get current branch', {
        startPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Gets the remote URL for the specified remote
   */
  async getRemoteUrl(startPath: string, remote = 'origin'): Promise<string | undefined> {
    try {
      const output = await this.runGit(['remote', '-v'], startPath);
      if (!output) {
        return undefined;
      }

      // Parse output from "git remote -v"
      // Format: "origin\thttps://github.com/user/repo.git (fetch)"
      //         "origin\thttps://github.com/user/repo.git (push)"
      const lines = output.split('\n');
      for (const line of lines) {
        // Look for lines matching the specified remote (tab-separated)
        if (line.startsWith(`${remote}\t`)) {
          // Split by tab: [remote_name, url_with_suffix]
          const parts = line.split('\t');
          if (parts.length >= 2) {
            // Extract URL by removing " (fetch)" or " (push)" suffix
            const url = parts[1].replace(/\s+\(fetch\)|\s+\(push\)$/, '').trim();
            if (url) {
              return url;
            }
          }
        }
      }

      this.logger.debug('Remote not found in git remote -v output', {
        startPath,
        remote,
        output,
      });
      return undefined;
    } catch (error) {
      this.logger.debug('Failed to get remote URL', {
        startPath,
        remote,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Runs a git command
   */
  private async runGit(args: string[], cwd: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
      return stdout.trim();
    } catch {
      // Don't throw for git commands that might fail (like not in a git repo)
      // Just return undefined and let the caller handle it
      return undefined;
    }
  }
}
