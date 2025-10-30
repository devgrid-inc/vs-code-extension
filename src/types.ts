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
  graphql?: string;
}

export interface DevGridClientOptions {
  apiBaseUrl: string;
  accessToken?: string;
  maxItems: number;
  endpoints?: DevGridEndpointTemplates;
  outputChannel?: { appendLine: (message: string) => void };
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

export interface DevGridVulnerabilityIdentifier {
  type: string;
  value: string;
  url?: string;
  name?: string;
  description?: string;
  publishedDate?: string;
  cvssScore?: number;
  vectorString?: string;
  epssScore?: number;
  impactScore?: number;
  exploitabilityScore?: number;
  attackVector?: string;
  attackComplexity?: string;
  weaknesses?: string[];
  references?: unknown;
  metrics?: unknown;
}

export interface DevGridVulnerabilityDetails {
  id: string;
  title: string;
  severity: string;
  status?: string;
  packageName?: string;
  versionRange?: string;
  publishedAt?: string;
  referenceUrl?: string;
  identifiers?: DevGridVulnerabilityIdentifier[];
  cvss?: {
    baseScore?: number;
    vector?: string;
  };
  description?: string;
  remediation?: {
    fixedVersion?: string;
    advice?: string;
  };
  references?: Array<{
    title?: string;
    url: string;
  }>;
  originatingSystem?: string;
  originatingSystemId?: string;
  originatingSystemUrl?: string;
  scanType?: string;
  location?: string;
  openDate?: string;
  closeDate?: string;
  vulnerableId?: string;
  vulnerableType?: string;
  attributes?: unknown;
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
