import * as vscode from 'vscode';

/**
 * Webview panel for displaying DevGrid YAML setup instructions
 */
export class DevGridSetupPanel {
  public static currentPanel: DevGridSetupPanel | undefined;
  public static readonly viewType = 'devgridSetupGuide';
  private static readonly docsUrl = 'https://docs.devgrid.io/docs/devgrid-project-yaml';

  private readonly panel: vscode.WebviewPanel;
  private readonly onMessage?: (message: { type: string; [key: string]: unknown }) => void;
  private disposables: vscode.Disposable[] = [];

  /**
   * Creates or shows the setup guide panel
   */
  public static createOrShow(
    onMessage?: (message: { type: string; [key: string]: unknown }) => void
  ): void {
    const column = vscode.ViewColumn.One;

    // If we already have a panel, show it
    if (DevGridSetupPanel.currentPanel) {
      DevGridSetupPanel.currentPanel.panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      DevGridSetupPanel.viewType,
      'DevGrid YAML Setup Guide',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DevGridSetupPanel.currentPanel = new DevGridSetupPanel(panel, onMessage);
    DevGridSetupPanel.currentPanel.render();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    onMessage?: (message: { type: string; [key: string]: unknown }) => void
  ) {
    this.panel = panel;
    this.onMessage = onMessage;

    // Listen for when the panel is disposed
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.type) {
          case 'createTemplate':
            if (this.onMessage) {
              this.onMessage({ type: 'createTemplate' });
            }
            break;
          case 'openDocs':
            await vscode.env.openExternal(vscode.Uri.parse(DevGridSetupPanel.docsUrl));
            break;
          case 'dismiss':
            this.dispose();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  /**
   * Renders the setup guide HTML
   */
  private render(): void {
    this.panel.webview.html = this.getHtml();
  }

  /**
   * Gets the HTML content for the setup guide
   */
  private getHtml(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DevGrid YAML Setup Guide</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 0;
            line-height: 1.6;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 25px;
          }
          .title {
            font-size: 1.8em;
            font-weight: 600;
            margin: 0 0 10px 0;
            color: var(--vscode-textLink-foreground);
          }
          .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 1em;
            margin: 0;
          }
          .section {
            margin-bottom: 30px;
          }
          .section-title {
            font-size: 1.3em;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-textLink-foreground);
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding-left: 10px;
          }
          .content {
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 15px;
          }
          .yaml-example {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 15px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            overflow-x: auto;
            white-space: pre;
            margin: 10px 0;
          }
          .yaml-example code {
            color: var(--vscode-editor-foreground);
          }
          .yaml-comment {
            color: var(--vscode-descriptionForeground);
          }
          .yaml-key {
            color: var(--vscode-textLink-foreground);
          }
          .yaml-string {
            color: var(--vscode-charts-yellow);
          }
          .yaml-number {
            color: var(--vscode-charts-blue);
          }
          .info-box {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            padding: 12px 15px;
            margin: 15px 0;
          }
          .warning-box {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-left: 3px solid var(--vscode-inputValidation-errorBorder);
            padding: 12px 15px;
            margin: 15px 0;
          }
          .success-box {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-charts-green);
            padding: 12px 15px;
            margin: 15px 0;
          }
          ul, ol {
            margin: 10px 0;
            padding-left: 25px;
          }
          li {
            margin: 8px 0;
          }
          .actions {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid var(--vscode-panel-border);
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }
          .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 3px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
            font-weight: 500;
          }
          .button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          .link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
          }
          .link:hover {
            text-decoration: underline;
          }
          code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
          }
          .field-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          .field-table th,
          .field-table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .field-table th {
            background-color: var(--vscode-editorWidget-background);
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">DevGrid YAML Configuration Setup</h1>
            <p class="subtitle">Learn how to configure your repository to work with DevGrid</p>
          </div>

          <div class="section">
            <h2 class="section-title">Why You Need This File</h2>
            <div class="content">
              <p>The <code>devgrid.yml</code> file connects your local repository to DevGrid, enabling you to:</p>
              <ul>
                <li>Sync your project structure with DevGrid's platform</li>
                <li>Map your components to applications and repositories</li>
                <li>Track vulnerabilities, incidents, and dependencies</li>
                <li>Enable automated insights and recommendations</li>
              </ul>
              <div class="info-box">
                <strong>📍 Location:</strong> Place the <code>devgrid.yml</code> file in your repository root directory.
              </div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Basic Structure</h2>
            <div class="content">
              <p>At minimum, your <code>devgrid.yml</code> file needs:</p>
              <ul>
                <li><strong>project.appId</strong> - Your application ID from DevGrid</li>
                <li><strong>project.components</strong> - At least one component definition</li>
              </ul>
              <div class="yaml-example"># DevGrid Configuration
# Documentation: https://docs.devgrid.io/docs/devgrid-project-yaml

project:
  appId: abc123  # Your application ID from DevGrid
  components:
  - name: my-component      # Your component name
    shortId: xyz789         # Component short ID from DevGrid
    manifest: package.json  # Path to manifest file</div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Field Reference</h2>
            <div class="content">
              <table class="field-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>project.appId</code></td>
                    <td>String/Number</td>
                    <td>Your application ID from DevGrid. Required.</td>
                  </tr>
                  <tr>
                    <td><code>project.components[].name</code></td>
                    <td>String</td>
                    <td>Component name. Recommended.</td>
                  </tr>
                  <tr>
                    <td><code>project.components[].shortId</code></td>
                    <td>String</td>
                    <td>Component short ID from DevGrid. Recommended.</td>
                  </tr>
                  <tr>
                    <td><code>project.components[].manifest</code></td>
                    <td>String</td>
                    <td>Path to manifest file (package.json, pom.xml, etc.). Recommended.</td>
                  </tr>
                  <tr>
                    <td><code>project.components[].api</code></td>
                    <td>String</td>
                    <td>Path to API definition file (swagger.yml, openapi.yaml, etc.). Optional.</td>
                  </tr>
                  <tr>
                    <td><code>project.components[].technologies</code></td>
                    <td>Array</td>
                    <td>List of technology short IDs. Optional.</td>
                  </tr>
                  <tr>
                    <td><code>project.components[].attributes</code></td>
                    <td>Object</td>
                    <td>Custom attributes. Optional.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Common Patterns</h2>
            
            <div class="content">
              <h3 style="margin-top: 0;">Single Component Project</h3>
              <div class="yaml-example">project:
  appId: 12345
  components:
  - name: frontend-app
    shortId: abc123
    manifest: package.json
    api: swagger.yml</div>
            </div>

            <div class="content">
              <h3 style="margin-top: 0;">Multi-Component Project</h3>
              <div class="yaml-example">project:
  appId: 12345
  components:
  - name: frontend
    shortId: abc123
    manifest: package.json
    technologies:
      - nodejs
      - react
  - name: backend
    shortId: def456
    manifest: pom.xml
    technologies:
      - java
      - spring</div>
            </div>

            <div class="content">
              <h3 style="margin-top: 0;">With Component Dependencies</h3>
              <div class="yaml-example">project:
  appId: 12345
  components:
  - name: api-service
    shortId: abc123
    manifest: package.json
    dependencies:
      - to: def456  # References another component's shortId
    relationships:
      - type: component-has-dependency
        to: def456</div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Next Steps</h2>
            <div class="content">
              <ol>
                <li><strong>Create the file:</strong> Use the "Create Template" button below to generate a starter template, or create <code>devgrid.yml</code> manually in your repository root.</li>
                <li><strong>Fill in the values:</strong> Replace TODO comments with your actual IDs from DevGrid.</li>
                <li><strong>Verify your manifest:</strong> Ensure the <code>manifest</code> path points to a valid file (package.json, pom.xml, etc.).</li>
                <li><strong>Save and refresh:</strong> Save the file and refresh the DevGrid view to see your insights.</li>
              </ol>
              <div class="success-box">
                <strong>💡 Tip:</strong> If your repository and components are already connected in DevGrid, the template generator can auto-fill many of these values for you!
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="button" onclick="createTemplate()">Create Template</button>
            <button class="button secondary" onclick="openDocs()">Open Documentation</button>
            <button class="button secondary" onclick="dismiss()">Dismiss</button>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function createTemplate() {
            vscode.postMessage({
              type: 'createTemplate'
            });
          }

          function openDocs() {
            vscode.postMessage({
              type: 'openDocs'
            });
          }

          function dismiss() {
            vscode.postMessage({
              type: 'dismiss'
            });
          }
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Disposes the panel
   */
  public dispose(): void {
    DevGridSetupPanel.currentPanel = undefined;
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
