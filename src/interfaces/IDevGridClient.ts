import type { DevGridIdentifiers, DevGridInsightBundle } from '../types';

/**
 * Interface for DevGrid API client operations
 */
export interface IDevGridClient {
  /**
   * Fetches comprehensive insights for the given identifiers
   * @param identifiers - The DevGrid identifiers to fetch insights for
   * @param workspacePath - Optional workspace path for Git operations
   * @returns Promise resolving to the insight bundle
   */
  fetchInsights(identifiers: DevGridIdentifiers, workspacePath?: string): Promise<DevGridInsightBundle>;

  /**
   * Gets the current status text for display in the status bar
   * @returns Current status text
   */
  getStatusText(): string;

  /**
   * Gets the dashboard URL for the current context
   * @returns Dashboard URL or undefined if not available
   */
  getDashboardUrl(): string | undefined;
}
