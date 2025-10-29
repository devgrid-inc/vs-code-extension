export interface DevGridIdentifiers {
  repositorySlug?: string;
  repositoryId?: string;
  componentSlug?: string;
  componentId?: string;
  applicationSlug?: string;
  applicationId?: string;
}

export interface DevGridEndpointTemplates {
  repository?: string;
  component?: string;
  application?: string;
  vulnerabilities?: string;
  incidents?: string;
  dependencies?: string;
  dashboardUrl?: string;
  entities?: string;
}

export interface DevGridProjectComponentConfig {
  name?: string;
  shortId?: string;
  api?: string;
  manifest?: string;
  attributes?: Record<string, unknown>;
  technologies?: string[];
  relationships?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface DevGridProjectConfig {
  appId?: string;
  components?: DevGridProjectComponentConfig[];
  [key: string]: unknown;
}

export interface DevGridFileConfig {
  apiBaseUrl?: string;
  identifiers?: DevGridIdentifiers;
  endpoints?: DevGridEndpointTemplates;
  project?: DevGridProjectConfig;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DevGridEntitySummary {
  id?: string;
  slug?: string;
  name?: string;
  url?: string;
  description?: string;
}

export interface DevGridVulnerability {
  id: string;
  title: string;
  severity: string;
  status?: string;
  packageName?: string;
  versionRange?: string;
  publishedAt?: string;
  referenceUrl?: string;
}

export interface DevGridIncident {
  id: string;
  title: string;
  state: string;
  openedAt?: string;
  closedAt?: string;
  summary?: string;
  url?: string;
}

export interface DevGridDependency {
  id: string;
  name: string;
  version?: string;
  type?: string;
  latestVersion?: string;
  url?: string;
}

export interface DevGridInsightBundle {
  application?: DevGridEntitySummary;
  component?: DevGridEntitySummary;
  repository?: DevGridEntitySummary;
  vulnerabilities: DevGridVulnerability[];
  incidents: DevGridIncident[];
  dependencies: DevGridDependency[];
}

export interface DevGridTreeItemData {
  kind: "section" | "entity" | "detail" | "empty" | "info";
  label: string;
  description?: string;
  tooltip?: string;
  icon?: string;
  collapsible?: boolean;
  url?: string;
  contextValue?: string;
}
