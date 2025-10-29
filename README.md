# DevGrid Insights (VS Code Extension)

DevGrid Insights surfaces details from your DevGrid workspace directly inside VS Code so you always have the current state of the repository, component, and application you are touching. The extension links the open project to DevGrid using `devgrid.yaml` and your Git metadata, then calls the DevGrid APIs to show:

- Repository, component, and application metadata
- Open vulnerabilities with severity, status, and quick links
- Recent incidents related to the component
- Declared dependencies

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Compile the extension**

   ```bash
   npm run compile
   ```

3. Press `F5` in VS Code to launch the extension host for local testing.

## Configuration

### API key

Run the command palette (`⇧⌘P` / `Ctrl+Shift+P`) and execute **DevGrid: Set API Key** to store your key securely using VS Code’s secret storage. Use **DevGrid: Clear API Key** to remove it.

> **Note:** The legacy workspace setting `DevGrid › Api Key` still acts as a fallback, but it is deprecated because it stores the value in plaintext.

### Workspace settings

Open VS Code settings (Command Palette → `Preferences: Open Settings (UI)`) to adjust:

- `DevGrid › Api Base Url` – Defaults to `https://prod.api.devgrid.io`.
- `DevGrid › Max Items Per Section` – Limits how many list items are rendered in each section (default: `5`).

### `devgrid.yaml`

Place a `devgrid.yaml` file at the repository root (or any parent directory). A minimal example:

```yaml
apiBaseUrl: https://prod.api.devgrid.io
repository:
  slug: org/my-service
component:
  id: comp_abc123
application:
  id: app_xyz789
endpoints:
  repository: /repositories/{repositorySlug}
  component: /components/{componentId}
  application: /applications/{applicationId}
  vulnerabilities: /vulnerabilities?vulnerableId={componentId}&limit=20
  incidents: /components/{componentId}/incidents?limit=20
  dependencies: /components/{componentId}/dependencies?limit=20
  entities: /entities?shortId={componentSlug}&types=component
  dashboardUrl: https://app.devgrid.io/repos/{repositoryId}
```

The identifiers act as fallbacks; the extension will also try to derive `repositorySlug` from the Git remote. Endpoint templates are optional—defaults are supplied—but you can override them to match your DevGrid workspace or self-hosted environment. Placeholders wrapped in braces (e.g. `{componentId}`) are replaced with values discovered from the API or config.

> **Identifier merging rules:** the loader accepts `identifiers.*`, root-level fields (`componentId`, `component_id`), or nested objects (`component.id`, `component.slug`, etc.). The first non-empty value wins.
>
> When `project.components` contains more than one entry, the extension picks the component whose `manifest` (priority) or `api` path exists on disk. Marking a component with `attributes.default: true` breaks ties.
>
> If only a component short ID is available, the extension calls the DevGrid `/entities` endpoint to resolve the canonical component and repository identifiers before making downstream requests.

## Commands

- **DevGrid: Refresh Insights** – Manually refresh the tree view.
- **DevGrid: Open Settings** – Jump to the DevGrid settings section.
- **DevGrid: Open in DevGrid** – Open the Dashboard URL derived from your configuration.
- **DevGrid: Set API Key** – Save your API key to secure storage.
- **DevGrid: Clear API Key** – Remove the stored API key.

## Development Notes

- The extension hosts a tree view (`DevGrid Insights`) in the Explorer sidebar.
- It watches for changes to `devgrid.yaml` and workspace configuration, refreshing automatically.
- HTTP calls use bearer authentication and the VS Code status bar shows the current sync state.
- API requests and responses, identifier resolution, and skipped calls are logged to the **DevGrid** output channel (`View → Output`).

## Publishing

```bash
npm run compile
vsce package
```

Upload the generated `.vsix` to the VS Code Marketplace or distribute it internally.
