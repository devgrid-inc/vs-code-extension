import * as vscode from "vscode";

import type { DevGridAuthProvider } from "./authProvider";

export interface AuthSession {
  accessToken: string;
  account: vscode.AuthenticationSessionAccountInformation;
  scopes: string[];
}

export class AuthService {
  private static readonly AUTH_TYPE = "devgrid-auth";
  private session: vscode.AuthenticationSession | undefined;

  constructor(private readonly authProvider?: DevGridAuthProvider) {
    vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === AuthService.AUTH_TYPE) {
        this.session = undefined;
      }
    });
  }

  async getSession(createIfNone = false): Promise<vscode.AuthenticationSession | undefined> {
    if (this.session) {
      return this.session;
    }

    try {
      this.session = await vscode.authentication.getSession(
        AuthService.AUTH_TYPE,
        ["openid", "profile", "email"],
        { createIfNone },
      );
      return this.session;
    } catch {
      // Session retrieval failed - return undefined to indicate no session available
      return undefined;
    }
  }

  async signIn(): Promise<vscode.AuthenticationSession | undefined> {
    try {
      this.session = await vscode.authentication.getSession(
        AuthService.AUTH_TYPE,
        ["openid", "profile", "email"],
        { createIfNone: true },
      );
      return this.session;
    } catch (error) {
      await vscode.window.showErrorMessage(`Failed to sign in: ${error}`);
      return undefined;
    }
  }

  async signOut(): Promise<void> {
    const session = await this.getSession(false);
    if (!session) {
      return;
    }

    if (this.authProvider) {
      await this.authProvider.removeSession(session.id);
    }
    this.session = undefined;
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession(false);
    return session !== undefined;
  }

  async getAccessToken(): Promise<string | undefined> {
    const session = await this.getSession(false);
    return session?.accessToken;
  }

  async getAccount(): Promise<vscode.AuthenticationSessionAccountInformation | undefined> {
    const session = await this.getSession(false);
    return session?.account;
  }
}
