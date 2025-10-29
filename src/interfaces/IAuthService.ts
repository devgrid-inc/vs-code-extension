/**
 * Interface for authentication service operations
 */
export interface IAuthService {
  /**
   * Gets the current access token
   * @returns Promise resolving to the access token or undefined if not authenticated
   */
  getAccessToken(): Promise<string | undefined>;

  /**
   * Signs in the user
   * @returns Promise resolving to true if sign-in was successful
   */
  signIn(): Promise<boolean>;

  /**
   * Signs out the current user
   * @returns Promise resolving when sign-out is complete
   */
  signOut(): Promise<void>;

  /**
   * Gets information about the current account
   * @returns Promise resolving to account information or undefined if not signed in
   */
  getAccount(): Promise<{ label: string; id: string } | undefined>;

  /**
   * Checks if the user is currently signed in
   * @returns Promise resolving to true if signed in
   */
  isSignedIn(): Promise<boolean>;
}
