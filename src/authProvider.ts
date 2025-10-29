import * as vscode from "vscode";
import * as https from "https";
import { URL } from "url";
import { randomUUID } from "crypto";
import config from "./config.json";

interface StoredSession {
  id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  account: vscode.AuthenticationSessionAccountInformation;
  scopes: string[];
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

interface AuthConfig {
  domain: string;
  clientId: string;
  audience: string;
  scope: string;
}

const STORAGE_KEY = "devgrid.auth.sessions";

export class DevGridAuthProvider implements vscode.AuthenticationProvider {
  public static readonly id = "devgrid-auth";

  private readonly sessionChangeEmitter =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

  readonly onDidChangeSessions = this.sessionChangeEmitter.event;

  constructor(
    private readonly secretStorage: vscode.SecretStorage,
    private readonly output: vscode.OutputChannel,
  ) {}

  async getSessions(
    scopes: readonly string[] | undefined,
    options: vscode.AuthenticationProviderSessionOptions,
  ): Promise<vscode.AuthenticationSession[]> {
    const stored = await this.loadSessions();
    const updated: StoredSession[] = [];
    const removed: StoredSession[] = [];

    for (const session of stored) {
      const refreshed = await this.ensureValidSession(session);
      if (refreshed) {
        updated.push(refreshed);
      } else {
        removed.push(session);
      }
    }

    if (removed.length > 0) {
      await this.storeSessions(updated);
      this.sessionChangeEmitter.fire({
        removed: removed.map((s) => this.toVsSession(s)),
        added: undefined,
        changed: undefined,
      });
    } else if (updated.length !== stored.length) {
      await this.storeSessions(updated);
    }

    const sessions = updated
      .filter((session) => this.matchesAccount(session, options?.account))
      .filter((session) => this.matchesScopes(session, scopes));

    return sessions.map((session) => this.toVsSession(session));
  }

  async createSession(
    scopes: readonly string[],
    _options: vscode.AuthenticationProviderSessionOptions,
  ): Promise<vscode.AuthenticationSession> {
    const authConfig = this.getAuthConfig();
    const combinedScopes = this.combineScopes(authConfig.scope, scopes);
    this.output.appendLine("[Auth] Starting device authorization flow");

    const deviceCode = await this.requestDeviceCode(authConfig, combinedScopes);
    await this.promptForVerification(deviceCode);

    const token = await vscode.window.withProgress<TokenResponse>(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Signing in to DevGrid…",
      },
      async () =>
        this.pollForToken(authConfig, deviceCode).catch((error) => {
          this.output.appendLine(`[Auth] Device flow failed: ${error}`);
          throw error;
        }),
    );

    this.output.appendLine("[Auth] Device flow completed");

    const account = this.buildAccountInfo(token);
    const storedSession: StoredSession = {
      id: randomUUID(),
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      account,
      scopes: this.combineScopes(token.scope ?? "", combinedScopes),
    };

    const sessions = await this.loadSessions();
    sessions.push(storedSession);
    await this.storeSessions(sessions);

    const vsSession = this.toVsSession(storedSession);
    this.sessionChangeEmitter.fire({ added: [vsSession], removed: undefined, changed: undefined });
    return vsSession;
  }

  async removeSession(sessionId: string): Promise<void> {
    const sessions = await this.loadSessions();
    const remaining = sessions.filter((session) => session.id !== sessionId);
    if (remaining.length === sessions.length) {
      return;
    }

    await this.storeSessions(remaining);
    this.sessionChangeEmitter.fire({
      added: undefined,
      changed: undefined,
      removed: sessions
        .filter((session) => session.id === sessionId)
        .map((session) => this.toVsSession(session)),
    });
    this.output.appendLine(`[Auth] Removed session ${sessionId}`);
  }

  private async ensureValidSession(session: StoredSession): Promise<StoredSession | undefined> {
    const now = Date.now();
    if (session.expiresAt > now + 60000) {
      return session;
    }

    if (!session.refreshToken) {
      this.output.appendLine(`[Auth] Session ${session.id} expired and cannot be refreshed`);
      return undefined;
    }

    try {
      const authConfig = this.getAuthConfig();
      const refreshed = await this.refreshSession(authConfig, session);
      this.output.appendLine(`[Auth] Refreshed access token for session ${session.id}`);
      return refreshed;
    } catch (error) {
      this.output.appendLine(`[Auth] Failed to refresh session ${session.id}: ${error}`);
      return undefined;
    }
  }

  private async refreshSession(config: AuthConfig, session: StoredSession): Promise<StoredSession> {
    const token = await this.postForm<TokenResponse>(`https://${config.domain}/oauth/token`, {
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: session.refreshToken ?? "",
    });

    return {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
      scopes: this.combineScopes(token.scope ?? "", session.scopes),
    };
  }

  private toVsSession(session: StoredSession): vscode.AuthenticationSession {
    return {
      id: session.id,
      accessToken: session.accessToken,
      account: session.account,
      scopes: session.scopes,
    };
  }

  private matchesScopes(session: StoredSession, scopes?: readonly string[]): boolean {
    if (!scopes || scopes.length === 0) {
      return true;
    }
    return scopes.every((scope) => session.scopes.includes(scope));
  }

  private matchesAccount(
    session: StoredSession,
    account: vscode.AuthenticationSessionAccountInformation | undefined,
  ): boolean {
    if (!account) {
      return true;
    }
    return session.account.id === account.id;
  }

  private async loadSessions(): Promise<StoredSession[]> {
    const raw = await this.secretStorage.get(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as StoredSession[];
      return parsed ?? [];
    } catch (error) {
      this.output.appendLine(`[Auth] Failed to parse stored sessions: ${error}`);
      return [];
    }
  }

  private async storeSessions(sessions: StoredSession[]): Promise<void> {
    await this.secretStorage.store(STORAGE_KEY, JSON.stringify(sessions));
  }

  private getAuthConfig(): AuthConfig {
    const auth = config.auth;
    if (!auth?.domain || !auth?.clientId || !auth?.audience || !auth?.scope) {
      throw new Error("Auth configuration is missing from config.json.");
    }
    return {
      domain: auth.domain,
      clientId: auth.clientId,
      audience: auth.audience,
      scope: auth.scope,
    };
  }

  private combineScopes(base: string | readonly string[], extra: readonly string[]): string[] {
    const baseArray = typeof base === "string" ? base.split(/\s+/).filter(Boolean) : Array.from(base);
    const merged = new Set<string>(baseArray);
    extra.forEach((scope) => {
      if (scope) {
        scope.split(/\s+/).forEach((item) => {
          if (item) {
            merged.add(item);
          }
        });
      }
    });
    return Array.from(merged);
  }

  private async requestDeviceCode(config: AuthConfig, scopes: string[]): Promise<DeviceCodeResponse> {
    return this.postForm<DeviceCodeResponse>(`https://${config.domain}/oauth/device/code`, {
      client_id: config.clientId,
      audience: config.audience,
      scope: scopes.join(" "),
    });
  }

  private async promptForVerification(device: DeviceCodeResponse): Promise<void> {
    const actions: string[] = [];
    if (device.verification_uri_complete) {
      actions.push("Open Browser");
    }
    actions.push("Copy Code");

    const choice = await vscode.window.showInformationMessage(
      `To sign in to DevGrid, continue in your browser and enter the code ${device.user_code}.`,
      ...actions,
    );

    if (choice === "Open Browser" && device.verification_uri_complete) {
      await vscode.env.openExternal(vscode.Uri.parse(device.verification_uri_complete));
    } else if (choice === "Copy Code") {
      await vscode.env.clipboard.writeText(device.user_code);
      await vscode.window.showInformationMessage("DevGrid verification code copied to clipboard.");
      if (device.verification_uri_complete) {
        await vscode.env.openExternal(vscode.Uri.parse(device.verification_uri_complete));
      } else {
        await vscode.env.openExternal(vscode.Uri.parse(device.verification_uri));
      }
    } else if (!choice) {
      if (device.verification_uri_complete) {
        await vscode.env.openExternal(vscode.Uri.parse(device.verification_uri_complete));
      } else {
        await vscode.env.openExternal(vscode.Uri.parse(device.verification_uri));
      }
    }
  }

  private async pollForToken(
    config: AuthConfig,
    device: DeviceCodeResponse,
  ): Promise<TokenResponse> {
    const tokenUrl = `https://${config.domain}/oauth/token`;
    const expiresAt = Date.now() + device.expires_in * 1000;
    let interval = (device.interval ?? 5) * 1000;

    while (Date.now() < expiresAt) {
      try {
        const token = await this.postForm<TokenResponse>(tokenUrl, {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device.device_code,
          client_id: config.clientId,
        });
        return token;
      } catch (error) {
        if (error instanceof DeviceFlowError) {
          if (error.error === "authorization_pending") {
            await delay(interval);
            continue;
          }
          if (error.error === "slow_down") {
            interval += 5000;
            await delay(interval);
            continue;
          }
          if (error.error === "expired_token") {
            throw new Error("Device authorization expired before completion.");
          }
        }
        throw error;
      }
    }

    throw new Error("Timed out waiting for device authorization.");
  }

  private buildAccountInfo(token: TokenResponse): vscode.AuthenticationSessionAccountInformation {
    const decoded = decodeIdToken(token.id_token);
    const id =
      decoded?.sub ??
      decoded?.email ??
      decoded?.preferred_username ??
      randomUUID();
    const label =
      decoded?.name ??
      decoded?.email ??
      decoded?.nickname ??
      "DevGrid Account";

    return { id, label };
  }

  private async postForm<T>(url: string, body: Record<string, string>): Promise<T> {
    const params = new URLSearchParams(body);
    const target = new URL(url);

    return new Promise<T>((resolve, reject) => {
      const request = https.request(
        {
          hostname: target.hostname,
          path: `${target.pathname}${target.search}`,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              try {
                resolve(JSON.parse(raw) as T);
              } catch (error) {
                reject(new Error(`Invalid response from auth service: ${(error as Error).message}`));
              }
            } else {
              try {
                const parsed = JSON.parse(raw) as { error?: string; error_description?: string };
                reject(new DeviceFlowError(parsed.error ?? "error", parsed.error_description ?? raw));
              } catch {
                reject(new Error(`Auth service error (${response.statusCode ?? "unknown"}): ${raw}`));
              }
            }
          });
        },
      );

      request.on("error", (error) => reject(error));
      request.write(params.toString());
      request.end();
    });
  }
}

class DeviceFlowError extends Error {
  constructor(public readonly error: string, message: string) {
    super(message);
  }
}

function decodeIdToken(idToken?: string): Record<string, any> | undefined {
  if (!idToken) {
    return undefined;
  }

  const parts = idToken.split(".");
  if (parts.length < 2) {
    return undefined;
  }

  try {
    const payload = parts[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return undefined;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
