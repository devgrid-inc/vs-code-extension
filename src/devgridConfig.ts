import * as vscode from "vscode";
import * as path from "path";
import { promises as fs } from "fs";
import yaml from "js-yaml";
import {
  DevGridFileConfig,
  DevGridIdentifiers,
  DevGridProjectComponentConfig,
} from "./types";
import {
  deriveRepositorySlug,
  getRemoteUrl,
  getRepositoryRoot,
} from "./gitUtils";

const CONFIG_FILE_CANDIDATES = ["devgrid.yaml", "devgrid.yml"];

export interface DevGridContext {
  workspaceFolder: vscode.WorkspaceFolder;
  repositoryRoot?: string;
  configPath?: string;
  config?: DevGridFileConfig;
  identifiers: DevGridIdentifiers;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch (_error) {
    return false;
  }
}

async function findConfigPath(start: string): Promise<string | undefined> {
  let current = path.normalize(start);
  const visited = new Set<string>();

  while (!visited.has(current)) {
    visited.add(current);

    for (const fileName of CONFIG_FILE_CANDIDATES) {
      const candidate = path.join(current, fileName);
      if (await pathExists(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return undefined;
}

async function resolveWorkspaceFolder(): Promise<
  vscode.WorkspaceFolder | undefined
> {
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    return undefined;
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const folder = vscode.workspace.getWorkspaceFolder(
      activeEditor.document.uri
    );
    if (folder) {
      return folder;
    }
  }

  return vscode.workspace.workspaceFolders[0];
}

export async function loadDevGridContext(
  outputChannel?: vscode.OutputChannel
): Promise<DevGridContext | undefined> {
  const workspaceFolder = await resolveWorkspaceFolder();
  if (!workspaceFolder) {
    return undefined;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const repositoryRoot = await getRepositoryRoot(workspacePath);
  const projectRoot = repositoryRoot ?? workspacePath;
  const configPath = await findConfigPath(projectRoot);
  const identifiers: DevGridIdentifiers = {};

  if (configPath) {
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = yaml.load(raw) as DevGridFileConfig | undefined;
      if (parsed) {
        const normalized = await normalizeIdentifiers(parsed, {
          configPath,
          projectRoot,
          outputChannel,
        });
        Object.assign(identifiers, normalized);
        return {
          workspaceFolder,
          repositoryRoot,
          configPath,
          config: parsed,
          identifiers: await enrichIdentifiers(
            identifiers,
            projectRoot,
            outputChannel
          ),
        };
      }
    } catch (error) {
      void vscode.window.showWarningMessage(
        `Unable to parse DevGrid config: ${(error as Error).message}`
      );
    }
  }

  return {
    workspaceFolder,
    repositoryRoot,
    configPath,
    config: undefined,
    identifiers: await enrichIdentifiers(
      identifiers,
      projectRoot,
      outputChannel
    ),
  };
}

async function enrichIdentifiers(
  identifiers: DevGridIdentifiers,
  repoPath: string,
  outputChannel?: vscode.OutputChannel
): Promise<DevGridIdentifiers> {
  if (!identifiers.repositorySlug) {
    const remoteUrl = await getRemoteUrl(repoPath);
    outputChannel?.appendLine(
      `[DevGrid:enrichIdentifiers] remoteUrl=${remoteUrl ?? "(none)"}`
    );
    const slug = deriveRepositorySlug(remoteUrl);
    outputChannel?.appendLine(
      `[DevGrid:enrichIdentifiers] derived slug=${slug ?? "(none)"}`
    );
    if (slug) {
      identifiers.repositorySlug = slug;
    }
  }

  return identifiers;
}

interface NormalizationOptions {
  configPath: string;
  projectRoot: string;
  outputChannel?: vscode.OutputChannel;
}

async function normalizeIdentifiers(
  config: DevGridFileConfig,
  options: NormalizationOptions
): Promise<DevGridIdentifiers> {
  const identifiers: DevGridIdentifiers = {};

  const setIfEmpty = (
    key: keyof DevGridIdentifiers,
    value: string | undefined
  ) => {
    if (!identifiers[key] && value) {
      identifiers[key] = value;
    }
  };

  // Explicit identifiers block takes precedence.
  if (config.identifiers) {
    for (const [key, rawValue] of Object.entries(config.identifiers)) {
      const typedKey = key as keyof DevGridIdentifiers;
      const value = safeString(rawValue);
      if (value) {
        identifiers[typedKey] = value;
      }
    }
  }

  const fallback = (getter: (cfg: any) => unknown): string | undefined => {
    try {
      return safeString(getter(config));
    } catch {
      return undefined;
    }
  };

  setIfEmpty("repositoryId", fallback((cfg) => cfg.repositoryId));
  setIfEmpty("repositoryId", fallback((cfg) => cfg.repository_id));
  setIfEmpty("repositorySlug", fallback((cfg) => cfg.repositorySlug));
  setIfEmpty("repositorySlug", fallback((cfg) => cfg.repository_slug));

  setIfEmpty("componentId", fallback((cfg) => cfg.componentId));
  setIfEmpty("componentId", fallback((cfg) => cfg.component_id));
  setIfEmpty("componentSlug", fallback((cfg) => cfg.componentSlug));
  setIfEmpty("componentSlug", fallback((cfg) => cfg.component_slug));

  setIfEmpty("applicationId", fallback((cfg) => cfg.applicationId));
  setIfEmpty("applicationId", fallback((cfg) => cfg.application_id));
  setIfEmpty("applicationSlug", fallback((cfg) => cfg.applicationSlug));
  setIfEmpty("applicationSlug", fallback((cfg) => cfg.application_slug));

  const project = config.project;
  if (project) {
    setIfEmpty("applicationId", safeString(project.appId));
    setIfEmpty(
      "applicationSlug",
      safeString((project as Record<string, unknown>)?.appSlug as string)
    );

    const component = await selectComponent(project.components, options);
    if (component) {
      const attributes =
        (component.attributes as Record<string, unknown> | undefined) ?? {};
      const shortId = safeString(component.shortId);
      if (shortId) {
        setIfEmpty("componentSlug", shortId);
      }
      setIfEmpty("componentSlug", safeString(attributes.slug as string));
      setIfEmpty("componentSlug", safeString(component.name));

      setIfEmpty("componentId", safeString(attributes.id as string));
      setIfEmpty("componentId", safeString(attributes.custom_id as string));
      setIfEmpty("componentId", safeString(attributes.component_id as string));

      const sourceRepository = safeString(
        attributes.source_code_repository as string
      );
      if (sourceRepository) {
        setIfEmpty("repositorySlug", deriveRepositorySlug(sourceRepository));
      }

      setIfEmpty(
        "repositorySlug",
        safeString(attributes.repositorySlug as string)
      );
      setIfEmpty(
        "repositorySlug",
        safeString(attributes.repository_slug as string)
      );
    }
  }

  options.outputChannel?.appendLine(
    `[DevGrid:config] identifiers=${JSON.stringify(identifiers)}`
  );

  return identifiers;
}

async function selectComponent(
  components: DevGridProjectComponentConfig[] | undefined,
  options: NormalizationOptions
): Promise<DevGridProjectComponentConfig | undefined> {
  if (!components || components.length === 0) {
    return undefined;
  }

  if (components.length === 1) {
    options.outputChannel?.appendLine(
      `[DevGrid:config] selected component=${componentLabel(components[0])}`
    );
    return components[0];
  }

  const configDir = path.dirname(options.configPath);
  const scored: Array<{
    component: DevGridProjectComponentConfig;
    score: number;
    manifestExists: boolean;
    apiExists: boolean;
    index: number;
  }> = [];

  for (const [index, component] of components.entries()) {
    let score = 0;
    let manifestExists = false;
    let apiExists = false;

    const manifest = safeString(component?.manifest as string);
    if (manifest) {
      const absolute = path.resolve(configDir, manifest);
      if (await pathExists(absolute)) {
        manifestExists = true;
        score += 4;
      }
    }

    const api = safeString(component?.api as string);
    if (api) {
      const absolute = path.resolve(configDir, api);
      if (await pathExists(absolute)) {
        apiExists = true;
        score += 2;
      }
    }

    const attributes =
      (component?.attributes as Record<string, unknown> | undefined) ?? {};
    if (attributes?.default === true) {
      score += 3;
    }
    if (safeString(attributes?.custom_id as string)) {
      score += 1;
    }

    scored.push({ component, score, manifestExists, apiExists, index });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  const selected = scored[0]?.component;
  if (selected) {
    options.outputChannel?.appendLine(
      `[DevGrid:config] selected component=${componentLabel(selected)} score=${scored[0]?.score}`
    );
  }
  return selected;
}

function componentLabel(component: DevGridProjectComponentConfig): string {
  const name = safeString(component.name);
  const shortId = safeString(component.shortId);
  return [shortId, name].filter(Boolean).join(" / ") || "unknown";
}

function safeString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
