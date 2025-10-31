import * as vscode from "vscode";

import type { AuthService } from "./authService";
import { loadDevGridContext, type DevGridContext } from "./devgridConfig";
import type { IDevGridClient } from "./interfaces/IDevGridClient";
import type { ILogger } from "./interfaces/ILogger";
import type { ServiceContainer } from "./services/ServiceContainer";
import type {
  DevGridInsightBundle,
  DevGridVulnerability,
  DevGridIncident,
  DevGridDependency,
  DevGridLinkageStatus,
} from "./types";
import { validateApiUrl } from "./utils/validation";
import { hasValidYamlConfig } from "./utils/yamlValidator";

export class DevGridTreeDataProvider
  implements vscode.TreeDataProvider<DevGridTreeItem>
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    DevGridTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private context: DevGridContext | undefined;
  private insights: DevGridInsightBundle | undefined;
  private client: IDevGridClient | undefined;
  private isLoading = false;
  private errorMessage: string | undefined;
  private readonly logger: ILogger;
  private readonly authService: AuthService;
  private readonly serviceContainer: ServiceContainer;

  constructor(
    serviceContainer: ServiceContainer,
    authService: AuthService
  ) {
    this.serviceContainer = serviceContainer;
    this.authService = authService;
    this.logger = serviceContainer.getLogger();
  }

  async initialize(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = undefined;
    this.onDidChangeTreeDataEmitter.fire();

    try {
      this.logger.info("Refresh started");
      this.context = await loadDevGridContext();
      if (!this.context) {
        this.errorMessage = "Open a workspace to see DevGrid insights.";
        this.insights = undefined;
        this.logger.info("No workspace context available");
        return;
      }

      this.logger.info("Identifiers loaded", {
        repositoryId: this.context.identifiers.repositoryId ?? "(none)",
        componentSlug: this.context.identifiers.componentSlug ?? "(none)",
        componentId: this.context.identifiers.componentId ?? "(none)",
        applicationSlug: this.context.identifiers.applicationSlug ?? "(none)",
        applicationId: this.context.identifiers.applicationId ?? "(none)",
      });

      const configuration = vscode.workspace.getConfiguration("devgrid");
      const apiBaseUrl =
        this.context.config?.apiBaseUrl?.trim() ||
        configuration.get<string>("apiBaseUrl", "https://prod.api.devgrid.io");
      const maxItems = configuration.get<number>("maxItemsPerSection", 5);

      const accessToken = await this.authService.getAccessToken();
      if (!accessToken) {
        this.errorMessage = "Sign in with DevGrid to fetch insights.";
        this.insights = undefined;
        this.logger.info("No OAuth access token available");
        return;
      }

      // Check for valid YAML config after authentication
      const hasYaml = await hasValidYamlConfig();
      if (!hasYaml) {
        this.errorMessage = "No valid devgrid.yml found. Set up your configuration to see insights.";
        this.insights = undefined;
        this.logger.info("No valid YAML config found");
        
        // Show prominent notification when attempting to use features
        void vscode.window.showWarningMessage(
          'DevGrid: No valid devgrid.yml file found. Set up your configuration to see insights.',
          'Create Template',
          'Setup Guide',
          'Learn More'
        ).then(action => {
          if (action === 'Create Template') {
            void vscode.commands.executeCommand('devgrid.createYamlTemplate');
          } else if (action === 'Setup Guide') {
            void vscode.commands.executeCommand('devgrid.openSetupGuide');
          } else if (action === 'Learn More') {
            void vscode.env.openExternal(vscode.Uri.parse('https://docs.devgrid.io/docs/devgrid-project-yaml'));
          }
        });
        return;
      }

      // Configure service container
      this.serviceContainer.setApiBaseUrl(validateApiUrl(apiBaseUrl));
      this.serviceContainer.setAuthToken(accessToken);

      // Create client using service container
      this.client = this.serviceContainer.createDevGridClient({
        apiBaseUrl,
        accessToken,
        maxItems,
        endpoints: this.context.config?.endpoints,
      });

      // Use repositoryRoot if available, otherwise fall back to workspace folder path
      const workspacePath = this.context.repositoryRoot ?? this.context.workspaceFolder.uri.fsPath;
      this.insights = await this.client.fetchInsights(this.context.identifiers, workspacePath);
      this.logger.info("Insights fetched", {
        repository: this.insights.repository?.slug ?? "-",
        component: this.insights.component?.slug ?? "-",
        application: this.insights.application?.slug ?? "-",
        vulnerabilities: this.insights.vulnerabilities.length,
        incidents: this.insights.incidents.length,
        dependencies: this.insights.dependencies.length,
      });
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : String(error);
      this.insights = undefined;
      this.logger.error("Refresh error", error as Error);
    } finally {
      this.isLoading = false;
      this.logger.info("Refresh complete");
      this.onDidChangeTreeDataEmitter.fire();
    }
  }

  getStatusText(): string {
    if (this.isLoading) {
      return "DevGrid: Loading…";
    }

    if (this.errorMessage) {
      return `DevGrid: ${this.errorMessage}`;
    }

    if (this.insights?.repository?.name) {
      return `DevGrid: ${this.insights.repository.name}`;
    }

    return "DevGrid: Ready";
  }

  getDashboardUrl(): string | undefined {
    const urlTemplate =
      this.context?.config?.endpoints?.dashboardUrl ||
      this.insights?.repository?.url;

    if (!urlTemplate) {
      return undefined;
    }

    const valueMap = {
      repositoryId:
        this.insights?.repository?.id ?? this.context?.identifiers.repositoryId,
      repositorySlug:
        this.insights?.repository?.slug,
      componentId:
        this.insights?.component?.id ?? this.context?.identifiers.componentId,
      componentSlug:
        this.insights?.component?.slug ??
        this.context?.identifiers.componentSlug,
      applicationId:
        this.insights?.application?.id ??
        this.context?.identifiers.applicationId,
      applicationSlug:
        this.insights?.application?.slug ??
        this.context?.identifiers.applicationSlug,
    };

    return renderTemplate(urlTemplate, valueMap);
  }

  getLinkageStatus(): DevGridLinkageStatus | undefined {
    return this.insights?.linkageStatus;
  }

  getRepositoryUrl(): string | undefined {
    return this.insights?.repository?.url;
  }

  getVulnerabilities(): DevGridVulnerability[] | undefined {
    return this.insights?.vulnerabilities;
  }

  getTreeItem(element: DevGridTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: DevGridTreeItem
  ): vscode.ProviderResult<DevGridTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    switch (element.contextValue) {
      case "section:repository":
        return this.getRepositoryItems();
      case "section:component":
        return this.getComponentItems();
      case "section:application":
        return this.getApplicationItems();
      case "section:vulnerabilities":
        return this.getVulnerabilityItems();
      case "section:incidents":
        return this.getIncidentItems();
      case "section:dependencies":
        return this.getDependencyItems();
      default:
        // Handle vulnerability groups
        if (element.contextValue?.startsWith("vulnerability-group:")) {
          return this.getVulnerabilityGroupItems(element.contextValue);
        }
        return [];
    }
  }

  private getRootItems(): DevGridTreeItem[] {
    if (this.isLoading) {
      return [DevGridTreeItem.info("Loading DevGrid insights…", "sync~spin")];
    }

    if (this.errorMessage) {
      return [DevGridTreeItem.info(this.errorMessage, "warning")];
    }

    if (!this.insights) {
      return [
        DevGridTreeItem.info("No DevGrid insights available.", "question"),
      ];
    }

    return [
      DevGridTreeItem.section("Repository", "section:repository", "repo"),
      DevGridTreeItem.section("Component", "section:component", "package"),
      DevGridTreeItem.section("Application", "section:application", "layers"),
      DevGridTreeItem.section(
        "Vulnerabilities",
        "section:vulnerabilities",
        "shield"
      ),
      DevGridTreeItem.section("Incidents", "section:incidents", "warning"),
      DevGridTreeItem.section(
        "Dependencies",
        "section:dependencies",
        "versions"
      ),
    ];
  }

  private getRepositoryItems(): DevGridTreeItem[] {
    if (!this.insights?.repository) {
      return [DevGridTreeItem.empty("Repository not matched in DevGrid.")];
    }

    const { repository: repo, linkageStatus } = this.insights;
    const items: DevGridTreeItem[] = [
      DevGridTreeItem.detail(`Name: ${repo.name ?? "Unknown"}`, "repo"),
      repo.slug
        ? DevGridTreeItem.detail(`Slug: ${repo.slug}`, "symbol-method")
        : undefined,
      repo.id
        ? DevGridTreeItem.detail(`ID: ${repo.id}`, "symbol-key")
        : undefined,
      repo.description
        ? DevGridTreeItem.detail(repo.description, "note")
        : undefined,
    ];

    // Add linkage status indicator
    if (linkageStatus) {
      const linkageIcon = linkageStatus.repoComponentLinked === true 
        ? "check" 
        : linkageStatus.repoComponentLinked === false 
        ? "warning" 
        : "question";
      const linkageLabel = linkageStatus.repoComponentLinked === true
        ? `✓ ${linkageStatus.message}`
        : linkageStatus.repoComponentLinked === false
        ? `⚠ ${linkageStatus.message}`
        : `? ${linkageStatus.message}`;
      items.push(DevGridTreeItem.detail(linkageLabel, linkageIcon));
    }

    if (repo.url) {
      items.push(DevGridTreeItem.link("Open in SCM", repo.url, "globe"));
    }

    return items.filter((item): item is DevGridTreeItem => Boolean(item));
  }

  private getComponentItems(): DevGridTreeItem[] {
    if (!this.insights?.component) {
      return [DevGridTreeItem.empty("Component not linked.")];
    }

    const {component} = this.insights;
    const componentDevGridUrl = component.id
      ? `https://app.devgrid.io/inventory/component/${component.id}`
      : undefined;
    
    return [
      DevGridTreeItem.detail(`Name: ${component.name ?? "Unknown"}`, "package"),
      component.slug
        ? DevGridTreeItem.detail(`Slug: ${component.slug}`, "tag")
        : undefined,
      component.id
        ? DevGridTreeItem.detail(`ID: ${component.id}`, "symbol-key")
        : undefined,
      component.description
        ? DevGridTreeItem.detail(component.description, "note")
        : undefined,
      componentDevGridUrl
        ? DevGridTreeItem.link("Open in DevGrid", componentDevGridUrl, "globe")
        : undefined,
    ].filter((item): item is DevGridTreeItem => Boolean(item));
  }

  private getApplicationItems(): DevGridTreeItem[] {
    if (!this.insights?.application) {
      return [DevGridTreeItem.empty("Application not linked.")];
    }

    const {application} = this.insights;
    const applicationDevGridUrl = application.id
      ? `https://app.devgrid.io/inventory/application/${application.id}`
      : undefined;
    
    return [
      DevGridTreeItem.detail(
        `Name: ${application.name ?? "Unknown"}`,
        "layers"
      ),
      application.slug
        ? DevGridTreeItem.detail(`Slug: ${application.slug}`, "tag")
        : undefined,
      application.id
        ? DevGridTreeItem.detail(`ID: ${application.id}`, "symbol-key")
        : undefined,
      application.description
        ? DevGridTreeItem.detail(application.description, "note")
        : undefined,
      applicationDevGridUrl
        ? DevGridTreeItem.link("Open in DevGrid", applicationDevGridUrl, "globe")
        : undefined,
    ].filter((item): item is DevGridTreeItem => Boolean(item));
  }

  private getVulnerabilityItems(): DevGridTreeItem[] {
    if (!this.insights) {
      return [];
    }

    if (this.insights.vulnerabilities.length === 0) {
      return [DevGridTreeItem.empty("No active vulnerabilities.")];
    }

    // Group vulnerabilities by criticality
    const vulnerabilitiesByCriticality = this.insights.vulnerabilities.reduce(
      (groups, vulnerability) => {
        const criticality = vulnerability.severity?.toLowerCase() || "unknown";
        if (!groups[criticality]) {
          groups[criticality] = [];
        }
        groups[criticality].push(vulnerability);
        return groups;
      },
      {} as Record<string, DevGridVulnerability[]>
    );

    // Create criticality groups in order of severity
    const criticalityOrder = ["critical", "high", "medium", "low", "unknown"];
    const items: DevGridTreeItem[] = [];

    for (const criticality of criticalityOrder) {
      const vulnerabilities = vulnerabilitiesByCriticality[criticality];
      if (vulnerabilities && vulnerabilities.length > 0) {
        const criticalityLabel = criticality.toUpperCase();
        const count = vulnerabilities.length;
        
        // Create a collapsible group for this criticality
        const groupItem = new DevGridTreeItem(
          `${criticalityLabel} (${count})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          `vulnerability-group:${criticality}`
        );
        groupItem.iconPath = new vscode.ThemeIcon(severityToIcon(criticality));
        groupItem.contextValue = `vulnerability-group:${criticality}`;
        items.push(groupItem);
      }
    }

    return items;
  }

  private getVulnerabilityGroupItems(contextValue: string): DevGridTreeItem[] {
    if (!this.insights) {
      return [];
    }

    // Extract criticality from context value (e.g., "vulnerability-group:critical" -> "critical")
    const criticality = contextValue.replace("vulnerability-group:", "");
    
    // Filter vulnerabilities by criticality
    const vulnerabilities = this.insights.vulnerabilities.filter(
      (vulnerability) => (vulnerability.severity?.toLowerCase() || "unknown") === criticality
    );

    return vulnerabilities.map((vulnerability) => createVulnerabilityItem(vulnerability));
  }

  private getIncidentItems(): DevGridTreeItem[] {
    if (!this.insights) {
      return [];
    }

    if (this.insights.incidents.length === 0) {
      return [DevGridTreeItem.empty("No recent incidents.")];
    }

    return this.insights.incidents.map((item) => createIncidentItem(item));
  }

  private getDependencyItems(): DevGridTreeItem[] {
    if (!this.insights) {
      return [];
    }

    if (this.insights.dependencies.length === 0) {
      return [DevGridTreeItem.empty("No dependencies reported.")];
    }

    return this.insights.dependencies.map((item) => createDependencyItem(item));
  }
}

export class DevGridTreeItem extends vscode.TreeItem {
  static section(
    label: string,
    contextValue: string,
    iconId: string
  ): DevGridTreeItem {
    const item = new DevGridTreeItem(
      label,
      vscode.TreeItemCollapsibleState.Collapsed,
      contextValue
    );
    item.iconPath = new vscode.ThemeIcon(iconId);
    return item;
  }

  static detail(label: string, iconId?: string): DevGridTreeItem {
    const item = new DevGridTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      "detail"
    );
    if (iconId) {
      item.iconPath = new vscode.ThemeIcon(iconId);
    }
    return item;
  }

  static link(label: string, url: string, iconId?: string): DevGridTreeItem {
    const item = new DevGridTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      "link"
    );
    item.command = {
      command: "vscode.open",
      title: "Open in Browser",
      arguments: [vscode.Uri.parse(url)],
    };
    item.tooltip = url;
    if (iconId) {
      item.iconPath = new vscode.ThemeIcon(iconId);
    }
    return item;
  }

  static empty(label: string): DevGridTreeItem {
    const item = new DevGridTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      "empty"
    );
    item.iconPath = new vscode.ThemeIcon("info");
    return item;
  }

  static info(label: string, iconId: string): DevGridTreeItem {
    const item = new DevGridTreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
      "info"
    );
    item.iconPath = new vscode.ThemeIcon(iconId);
    return item;
  }

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    contextValue: string
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
  }
}

function createVulnerabilityItem(
  vulnerability: DevGridVulnerability
): DevGridTreeItem {
  const severityIcon = severityToIcon(vulnerability.severity);
  const label = vulnerability.title;
  const descriptionParts = [
    vulnerability.severity ? vulnerability.severity.toUpperCase() : undefined,
    vulnerability.packageName ? `pkg: ${vulnerability.packageName}` : undefined,
  ].filter(Boolean);

  const item = new DevGridTreeItem(
    label,
    vscode.TreeItemCollapsibleState.None,
    "vulnerability"
  );
  item.id = vulnerability.id;
  (item as any).vulnerabilityId = vulnerability.id;
  item.description = descriptionParts.join(" • ");
  item.tooltip = buildTooltip([
    `Severity: ${vulnerability.severity}`,
    vulnerability.status ? `Status: ${vulnerability.status}` : undefined,
    vulnerability.versionRange
      ? `Range: ${vulnerability.versionRange}`
      : undefined,
    vulnerability.publishedAt
      ? `Published: ${vulnerability.publishedAt}`
      : undefined,
  ]);
  item.iconPath = new vscode.ThemeIcon(severityIcon);

  // Set command to open vulnerability details panel
  item.command = {
    command: "devgrid.openVulnerability",
    title: "Open Vulnerability Details",
    arguments: [vulnerability.id],
  };

  return item;
}

function createIncidentItem(incident: DevGridIncident): DevGridTreeItem {
  const label = incident.title;
  const item = new DevGridTreeItem(
    label,
    vscode.TreeItemCollapsibleState.None,
    "incident"
  );
  const descriptionParts = [
    incident.state ? incident.state.toUpperCase() : undefined,
    incident.openedAt ? `opened ${incident.openedAt}` : undefined,
  ].filter(Boolean);

  item.description = descriptionParts.join(" • ");
  item.tooltip = buildTooltip([
    incident.summary,
    incident.openedAt ? `Opened: ${incident.openedAt}` : undefined,
    incident.closedAt ? `Closed: ${incident.closedAt}` : undefined,
  ]);
  item.iconPath = new vscode.ThemeIcon("warning");
  if (incident.url) {
    item.command = {
      command: "vscode.open",
      title: "Open Incident",
      arguments: [vscode.Uri.parse(incident.url)],
    };
  }

  return item;
}

function createDependencyItem(dependency: DevGridDependency): DevGridTreeItem {
  const label = dependency.name;
  const item = new DevGridTreeItem(
    label,
    vscode.TreeItemCollapsibleState.None,
    "dependency"
  );
  const descriptionParts = [
    dependency.version ? `current ${dependency.version}` : undefined,
    dependency.latestVersion ? `latest ${dependency.latestVersion}` : undefined,
    dependency.type,
  ].filter(Boolean);

  item.description = descriptionParts.join(" • ");
  item.tooltip = buildTooltip([
    dependency.type ? `Type: ${dependency.type}` : undefined,
    dependency.version ? `Current: ${dependency.version}` : undefined,
    dependency.latestVersion
      ? `Latest: ${dependency.latestVersion}`
      : undefined,
  ]);
  item.iconPath = new vscode.ThemeIcon("versions");
  if (dependency.url) {
    item.command = {
      command: "vscode.open",
      title: "Open Dependency",
      arguments: [vscode.Uri.parse(dependency.url)],
    };
  }

  return item;
}

function severityToIcon(severity?: string): string {
  const value = severity?.toLowerCase();
  switch (value) {
    case "critical":
      return "flame";
    case "high":
      return "shield";
    case "medium":
      return "shield";
    case "low":
      return "shield";
    default:
      return "info";
  }
}

function buildTooltip(parts: (string | undefined)[]): string | undefined {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join("\n") : undefined;
}

function renderTemplate(
  template: string,
  context: Record<string, string | undefined>
): string {
  return template.replace(
    /\{([^}]+)\}/g,
    (_match, key: string) => context[key] ?? ""
  );
}
