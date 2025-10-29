import * as vscode from "vscode";

const SECRET_KEY = "devgrid.apiKey";

export class DevGridSecretStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getApiKey(): Promise<string | undefined> {
    const value = await this.context.secrets.get(SECRET_KEY);
    return value?.trim() || undefined;
  }

  async setApiKey(value: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY, value);
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
  }
}
