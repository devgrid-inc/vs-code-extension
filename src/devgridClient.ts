import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";
import { URL } from "url";
import {
  DevGridDependency,
  DevGridEndpointTemplates,
  DevGridEntitySummary,
  DevGridIncident,
  DevGridInsightBundle,
  DevGridIdentifiers,
  DevGridVulnerability,
} from "./types";

const DEFAULT_ENDPOINTS: Required<
  Pick<
    DevGridEndpointTemplates,
    | "repository"
    | "component"
    | "application"
    | "vulnerabilities"
    | "incidents"
    | "dependencies"
    | "entities"
  >
> = {
  repository: "/repositories/{repositorySlug}",
  component: "/components/{componentId}",
  application: "/applications/{applicationSlug}",
  vulnerabilities: "/vulnerabilities?vulnerableId={componentId}&limit=20",
  incidents: "/components/{componentId}/incidents?limit=20",
  dependencies: "/components/{componentId}/dependencies?limit=50",
  entities: "/entities?shortId={componentSlug}&types=component",
};

export interface DevGridClientOptions {
  apiBaseUrl: string;
  apiKey?: string;
  maxItems: number;
  endpoints?: DevGridEndpointTemplates;
  outputChannel?: vscode.OutputChannel;
}

type HttpModule = typeof https | typeof http;

export class DevGridClient {
  private readonly apiBaseUrl: string;
  private readonly apiKey?: string;
  private readonly maxItems: number;
  private readonly endpoints: DevGridEndpointTemplates;
  private readonly outputChannel?: vscode.OutputChannel;

  constructor(options: DevGridClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.maxItems = options.maxItems;
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints };
    this.outputChannel = options.outputChannel;
  }

  async fetchInsights(
    identifiers: DevGridIdentifiers
  ): Promise<DevGridInsightBundle> {
    const context = { ...identifiers };
    await this.ensureComponentIdentifiers(context);

    const bundle: DevGridInsightBundle = {
      application: undefined,
      component: undefined,
      repository: undefined,
      vulnerabilities: [],
      incidents: [],
      dependencies: [],
    };

    // Repository
    if (
      this.endpoints.repository &&
      (context.repositorySlug || context.repositoryId)
    ) {
      const repository = await this.fetchEntity(
        this.endpoints.repository,
        context
      );
      if (repository) {
        bundle.repository = repository;
        context.repositoryId = context.repositoryId ?? repository.id;
        context.repositorySlug = context.repositorySlug ?? repository.slug;
      }
    }

    // Component
    if (
      this.endpoints.component &&
      (context.componentSlug || context.componentId || context.repositoryId)
    ) {
      const component = await this.fetchEntity(
        this.endpoints.component,
        context
      );
      if (component) {
        bundle.component = component;
        context.componentId = context.componentId ?? component.id;
        context.componentSlug = context.componentSlug ?? component.slug;
      }
    }

    // Application
    if (
      this.endpoints.application &&
      (context.applicationSlug || context.applicationId || context.componentId)
    ) {
      const application = await this.fetchEntity(
        this.endpoints.application,
        context
      );
      if (application) {
        bundle.application = application;
        context.applicationId = context.applicationId ?? application.id;
        context.applicationSlug = context.applicationSlug ?? application.slug;
      }
    }

    const [vulns, incidents, dependencies] = await Promise.all([
      this.fetchCollection<DevGridVulnerability>(
        this.endpoints.vulnerabilities,
        context,
        mapVulnerability
      ),
      this.fetchCollection<DevGridIncident>(
        this.endpoints.incidents,
        context,
        mapIncident
      ),
      this.fetchCollection<DevGridDependency>(
        this.endpoints.dependencies,
        context,
        mapDependency
      ),
    ]);

    bundle.vulnerabilities = vulns.slice(0, this.maxItems);
    bundle.incidents = incidents.slice(0, this.maxItems);
    bundle.dependencies = dependencies.slice(0, this.maxItems);

    return bundle;
  }

  private async fetchEntity(
    template: string,
    context: DevGridIdentifiers
  ): Promise<DevGridEntitySummary | undefined> {
    try {
      const url = this.buildUrl(template, context);
      if (!url) {
        this.logTrace(
          `[DevGrid:fetchEntity] Skipped template '${template}' (missing identifiers)`
        );
        return undefined;
      }
      const json = await this.request<any>("GET", url);
      const entity = Array.isArray(json)
        ? json[0]
        : json?.data ?? json ?? undefined;
      if (!entity) {
        return undefined;
      }

      return mapEntity(entity);
    } catch (error) {
      this.logError("fetchEntity", error);
      return undefined;
    }
  }

  private async fetchCollection<T>(
    template: string | undefined,
    context: DevGridIdentifiers,
    mapper: (input: any) => T | undefined
  ): Promise<T[]> {
    if (!template) {
      return [];
    }

    try {
      const url = this.buildUrl(template, context);
      if (!url) {
        this.logTrace(
          `[DevGrid:fetchCollection] Skipped template '${template}' (missing identifiers)`
        );
        return [];
      }
      const json = await this.request<any>("GET", url);
      const collection = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
        ? json
        : json?.items;
      if (!Array.isArray(collection)) {
        return [];
      }
      return collection.map(mapper).filter((item): item is T => Boolean(item));
    } catch (error) {
      this.logError("fetchCollection", error);
      return [];
    }
  }

  private async ensureComponentIdentifiers(
    context: DevGridIdentifiers
  ): Promise<void> {
    if (
      context.componentSlug &&
      context.componentId &&
      context.componentId !== context.componentSlug
    ) {
      return;
    }

    if (!this.endpoints.entities || !context.componentSlug) {
      return;
    }

    try {
      const url = this.buildUrl(this.endpoints.entities, context);
      if (!url) {
        this.logTrace(
          `[DevGrid:ensureComponent] Skipped entity lookup (missing identifiers)`
        );
        return;
      }

      const response = await this.request<any>("GET", url);
      const collection = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
        ? response
        : response?.items;
      if (!Array.isArray(collection) || collection.length === 0) {
        this.logTrace(
          `[DevGrid:ensureComponent] No entities returned for shortId='${context.componentSlug}'`
        );
        return;
      }

      const component =
        collection.find((item) =>
          typeof item?.type === "string"
            ? item.type.toLowerCase() === "component"
            : true
        ) ?? collection[0];

      if (!component) {
        return;
      }

      const attributes =
        (component.attributes as Record<string, unknown> | undefined) ?? {};

      context.componentId =
        context.componentId ??
        pickString(component, ["id", "entityId"]) ??
        pickString(attributes, ["id", "componentId", "component_id", "uuid"]);

      context.componentSlug =
        context.componentSlug ??
        pickString(component, ["shortId", "slug", "name"]) ??
        pickString(attributes, ["slug", "shortId"]);

      context.repositoryId =
        context.repositoryId ??
        pickString(attributes, ["repositoryId", "repository_id"]);

      context.repositorySlug =
        context.repositorySlug ??
        pickString(attributes, ["repositorySlug", "repository_slug"]);

      context.applicationId =
        context.applicationId ?? pickString(attributes, ["appId", "applicationId"]);

      context.applicationSlug =
        context.applicationSlug ??
        pickString(attributes, ["appSlug", "applicationSlug"]);

      this.logTrace(
        `[DevGrid:ensureComponent] entity resolved componentId=${
          context.componentId ?? "(none)"
        } componentSlug=${context.componentSlug ?? "(none)"} repositoryId=${
          context.repositoryId ?? "(none)"
        } repositorySlug=${context.repositorySlug ?? "(none)"}`
      );
    } catch (error) {
      this.logError("ensureComponent", error);
    }

    if (!context.componentId && context.componentSlug) {
      context.componentId = context.componentSlug;
    }
  }

  private buildUrl(
    template: string,
    context: DevGridIdentifiers
  ): string | undefined {
    if (!template) {
      return undefined;
    }

    const record = { ...context } as Record<string, string | undefined>;
    const missingKeys: string[] = [];

    const rendered = template.replace(
      /\{([^}]+)\}/g,
      (_match: string, rawKey: string) => {
        const key = rawKey.trim();
        const value = record[key];
        if (!value) {
          missingKeys.push(key);
          return "";
        }
        return value;
      }
    );

    if (missingKeys.length > 0) {
      this.logTrace(
        `[DevGrid:buildUrl] Missing identifiers for template '${template}': ${missingKeys.join(
          ", "
        )}`
      );
      return undefined;
    }

    if (!rendered) {
      return undefined;
    }

    if (/^https?:\/\//i.test(rendered)) {
      return rendered;
    }

    return `${this.apiBaseUrl}${
      rendered.startsWith("/") ? "" : "/"
    }${rendered}`;
  }

  private request<T>(
    method: string,
    rawUrl: string,
    body?: unknown
  ): Promise<T> {
    const url = new URL(rawUrl);
    const isHttps = url.protocol === "https:";
    const transport: HttpModule = isHttps ? https : http;
    const sanitizedUrl = sanitizeUrl(url);
    this.logTrace(`${method.toUpperCase()} ${sanitizedUrl}`);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    let payload: string | undefined;
    if (body) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    if (this.apiKey) {
      headers["X-API-KEY"] = this.apiKey;
      headers["x-api-key"] = this.apiKey;
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    this.logTrace(
      `${method.toUpperCase()} ${sanitizedUrl} headers=${JSON.stringify(
        sanitizeHeadersForLog(headers)
      )}`
    );

    const options: https.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers,
    };

    return new Promise<T>((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const { statusCode = 0 } = res;
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");

          if (statusCode >= 400) {
            this.logTrace(
              `${method.toUpperCase()} ${sanitizedUrl} -> ${statusCode}`
            );
            return reject(
              new Error(`DevGrid API request failed (${statusCode}): ${raw}`)
            );
          }

          if (raw.length === 0) {
            this.logTrace(
              `${method.toUpperCase()} ${sanitizedUrl} -> ${statusCode} (empty)`
            );
            resolve({} as T);
            return;
          }

          try {
            this.logTrace(
              `${method.toUpperCase()} ${sanitizedUrl} -> ${statusCode}`
            );
            resolve(JSON.parse(raw) as T);
          } catch (error) {
            this.logTrace(
              `${method.toUpperCase()} ${sanitizedUrl} -> ${statusCode} (parse error)`
            );
            reject(
              new Error(
                `Unable to parse DevGrid API response: ${
                  (error as Error).message
                }`
              )
            );
          }
        });
      });

      req.on("error", (error) => {
        this.logTrace(
          `${method.toUpperCase()} ${sanitizedUrl} -> network error: ${String(
            error
          )}`
        );
        reject(error);
      });

      if (payload) {
        req.write(payload);
      }

      req.end();
    });
  }

  private logError(scope: string, error: unknown): void {
    if (!this.outputChannel) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`[DevGrid:${scope}] ${message}`);
  }

  private logTrace(message: string): void {
    if (!this.outputChannel) {
      return;
    }
    this.outputChannel.appendLine(`[DevGrid] ${message}`);
  }
}

function mapEntity(input: any): DevGridEntitySummary {
  return {
    id: extract(input, ["id", "uuid", "identifier"]),
    slug: extract(input, ["slug", "key", "name"]),
    name: extract(input, ["name", "title", "label", "slug"]),
    url: extract(input, ["url", "html_url", "link"]),
    description: extract(input, ["description", "summary"]),
  };
}

function mapVulnerability(input: any): DevGridVulnerability | undefined {
  const id = extract(input, ["id", "uuid", "identifier"]);
  const title = extract(input, ["title", "name", "summary"]);
  const severity = (
    extract(input, ["severity", "level"]) ?? "unknown"
  ).toLowerCase();

  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    title,
    severity,
    status: extract(input, ["status", "state"]),
    packageName: extract(input, ["package", "packageName", "dependency"]),
    versionRange: extract(input, ["affectedRange", "range", "version"]),
    publishedAt: extract(input, ["publishedAt", "published_at", "createdAt"]),
    referenceUrl: extract(input, ["url", "html_url", "reference"]),
  };
}

function mapIncident(input: any): DevGridIncident | undefined {
  const id = extract(input, ["id", "uuid", "identifier"]);
  const title = extract(input, ["title", "name", "summary"]);
  const state = (
    extract(input, ["state", "status"]) ?? "unknown"
  ).toLowerCase();

  if (!id || !title) {
    return undefined;
  }

  return {
    id,
    title,
    state,
    openedAt: extract(input, ["openedAt", "opened_at", "createdAt"]),
    closedAt: extract(input, ["closedAt", "closed_at", "resolvedAt"]),
    summary: extract(input, ["description", "summary", "details"]),
    url: extract(input, ["url", "html_url", "link"]),
  };
}

function mapDependency(input: any): DevGridDependency | undefined {
  const id = extract(input, ["id", "uuid", "identifier", "name"]);
  const name = extract(input, ["name", "package", "module"]);

  if (!id || !name) {
    return undefined;
  }

  return {
    id,
    name,
    version: extract(input, ["version", "currentVersion"]),
    type: extract(input, ["type", "kind", "ecosystem"]),
    latestVersion: extract(input, ["latestVersion", "latest"]),
    url: extract(input, ["url", "homepage", "html_url"]),
  };
}

function extract(value: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function pickString(
  source: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function sanitizeHeadersForLog(
  headers: Record<string, string>
): Record<string, string> {
  const copy: Record<string, string> = { ...headers };
  const apiKey = copy["X-API-KEY"] ?? copy["x-api-key"];
  if (apiKey) {
    const visible = apiKey.slice(-4);
    copy["X-API-KEY"] = `***${visible}`;
  }
  return copy;
}

function sanitizeUrl(url: URL): string {
  const clone = new URL(url.toString());
  clone.username = "";
  clone.password = "";
  return clone.toString();
}
