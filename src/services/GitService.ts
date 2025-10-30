import { promisify } from 'util';
import { execFile } from 'child_process';
import * as path from 'path';
import type { IGitService } from '../interfaces/IGitService';
import type { ILogger } from '../interfaces/ILogger';
import { deriveRepositorySlug } from '../utils/urlUtils';

const execFileAsync = promisify(execFile);

/**
 * Git service implementation
 */
export class GitService implements IGitService {
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
        error: error instanceof Error ? error.message : String(error) 
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
        error: error instanceof Error ? error.message : String(error) 
      });
      return undefined;
    }
  }

  /**
   * Gets the remote URL for the specified remote
   */
  async getRemoteUrl(startPath: string, remote = 'origin'): Promise<string | undefined> {
    try {
      return await this.runGit(['remote', 'get-url', remote], startPath);
    } catch (error) {
      this.logger.debug('Failed to get remote URL', { 
        startPath, 
        remote, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return undefined;
    }
  }

  /**
   * Derives a repository slug from a remote URL
   */
  deriveRepositorySlug(remoteUrl?: string): string | undefined {
    if (!remoteUrl) {
      return undefined;
    }

    try {
      return deriveRepositorySlug(remoteUrl);
    } catch (error) {
      this.logger.debug('Failed to derive repository slug', { 
        remoteUrl, 
        error: error instanceof Error ? error.message : String(error) 
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
    } catch (error) {
      // Don't throw for git commands that might fail (like not in a git repo)
      // Just return undefined and let the caller handle it
      return undefined;
    }
  }
}
