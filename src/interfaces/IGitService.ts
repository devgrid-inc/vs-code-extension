/**
 * Interface for Git operations
 */
export interface IGitService {
  /**
   * Gets the repository root directory
   * @param startPath - The path to start searching from
   * @returns Promise resolving to the repository root path or undefined if not found
   */
  getRepositoryRoot(startPath: string): Promise<string | undefined>;

  /**
   * Gets the current branch name
   * @param startPath - The path to check from
   * @returns Promise resolving to the branch name or undefined if not found
   */
  getCurrentBranch(startPath: string): Promise<string | undefined>;

  /**
   * Gets the remote URL for the specified remote
   * @param startPath - The path to check from
   * @param remote - The remote name (default: 'origin')
   * @returns Promise resolving to the remote URL or undefined if not found
   */
  getRemoteUrl(startPath: string, remote?: string): Promise<string | undefined>;
}
