import * as vscode from "vscode";
import type { DevGridContext } from "./interfaces/IConfigLoader";
import type { IDevGridClient } from "./interfaces/IDevGridClient";
import type { ServiceContainer } from "./services/ServiceContainer";
import {
  DevGridInsightBundle,
  DevGridVulnerability,
  DevGridIncident,
  DevGridDependency,
} from "./types";
import { AuthService } from "./authService";

/**
 * Tree item for DevGrid insights
 */
export class DevGridTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue?: string,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
  }

  static empty(message: string): DevGridTreeItem {
    const item = new DevGridTreeItem(message, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon("info");
    return item;
  }
}

/**
 * Refactored tree data provider using dependency injection
 */
export class DevGridTreeDataProvider implements vscode.TreeDataProvider<DevGridTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<DevGridTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private context: DevGridContext | undefined;
  private insights: DevGridInsightBundle | undefined;
  private client: IDevGridClient | undefined;
  private isLoading = false;
  private errorMessage: string | undefined;
  private dashboardUrl: string | undefined;

  constructor(
    private outputChannel: vscode.OutputChannel,
    private authService: AuthService,
    private serviceContainer: ServiceContainer
  ) {}

  /**
   * Initializes the tree data provider
   */
  async initialize(): Promise<void> {
    await this.refresh();
  }

  /**
   * Refreshes the tree data
   */
  async refresh(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = undefined;
    this.onDidChangeTreeDataEmitter.fire();

    try {
      this.outputChannel.appendLine("[DevGrid] refresh start");
      
      // Load configuration using the config service
      const configLoader = this.serviceContainer.getConfigLoader();
      this.context = await configLoader.loadDevGridContext(this.outputChannel);
      
      if (!this.context) {
        this.errorMessage = "Open a workspace to see DevGrid insights.";
        this.insights = undefined;
        this.client = undefined;
        this.onDidChangeTreeDataEmitter.fire();
        return;
      }

      // Get authentication token
      const token = await this.authService.getAccessToken();
      if (!token) {
        this.errorMessage = "Please sign in to DevGrid to see insights.";
        this.insights = undefined;
        this.client = undefined;
        this.onDidChangeTreeDataEmitter.fire();
        return;
      }

      // Create DevGrid client using service container
      this.client = this.serviceContainer.createDevGridClient({
        apiBaseUrl: this.context.apiBaseUrl,
        accessToken: token,
        maxItems: 100,
        endpoints: this.context.endpoints,
        outputChannel: this.outputChannel,
      });

      // Fetch insights
      this.insights = await this.client.fetchInsights(this.context.identifiers);
      
      // Set dashboard URL
      this.dashboardUrl = this.client.getDashboardUrl();

      this.outputChannel.appendLine("[DevGrid] refresh complete");
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[DevGrid] refresh error: ${this.errorMessage}`);
    } finally {
      this.isLoading = false;
      this.onDidChangeTreeDataEmitter.fire();
    }
  }

  /**
   * Gets the current status text for the status bar
   */
  getStatusText(): string {
    if (this.isLoading) {
      return "DevGrid: Loading…";
    }
    if (this.errorMessage) {
      return "DevGrid: Error";
    }
    if (!this.context) {
      return "DevGrid: No workspace";
    }
    if (!this.client) {
      return "DevGrid: Not authenticated";
    }
    return this.client.getStatusText();
  }

  /**
   * Gets the dashboard URL
   */
  getDashboardUrl(): string | undefined {
    return this.dashboardUrl;
  }

  /**
   * Gets the tree item for a given element
   */
  getTreeItem(element: DevGridTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Gets tree item children
   */
  getChildren(element?: DevGridTreeItem): DevGridTreeItem[] {
    if (this.isLoading) {
      return [DevGridTreeItem.empty("Loading DevGrid insights…")];
    }

    if (this.errorMessage) {
      return [DevGridTreeItem.empty(`Error: ${this.errorMessage}`)];
    }

    if (!this.context || !this.insights) {
      return [DevGridTreeItem.empty("No DevGrid insights available.")];
    }

    if (!element) {
      return this.getRootItems();
    }

    return this.getChildItems(element);
  }

  /**
   * Gets root level tree items
   */
  private getRootItems(): DevGridTreeItem[] {
    const items: DevGridTreeItem[] = [];

    // Repository section
    if (this.insights?.repository) {
      const repoItem = new DevGridTreeItem(
        `Repository: ${this.insights.repository.name || this.insights.repository.slug || "Unknown"}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "section:repository"
      );
      repoItem.iconPath = new vscode.ThemeIcon("repo");
      items.push(repoItem);
    }

    // Component section
    if (this.insights?.component) {
      const componentItem = new DevGridTreeItem(
        `Component: ${this.insights.component.name || this.insights.component.slug || "Unknown"}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "section:component"
      );
      componentItem.iconPath = new vscode.ThemeIcon("package");
      items.push(componentItem);
    }

    // Application section
    if (this.insights?.application) {
      const appItem = new DevGridTreeItem(
        `Application: ${this.insights.application.name || this.insights.application.slug || "Unknown"}`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "section:application"
      );
      appItem.iconPath = new vscode.ThemeIcon("server");
      items.push(appItem);
    }

    // Vulnerabilities section
    if (this.insights?.vulnerabilities && this.insights.vulnerabilities.length > 0) {
      const vulnItem = new DevGridTreeItem(
        `Vulnerabilities (${this.insights.vulnerabilities.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "section:vulnerabilities"
      );
      vulnItem.iconPath = new vscode.ThemeIcon("warning");
      items.push(vulnItem);
    }

    // Incidents section
    if (this.insights?.incidents && this.insights.incidents.length > 0) {
      const incidentItem = new DevGridTreeItem(
        `Incidents (${this.insights.incidents.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "section:incidents"
      );
      incidentItem.iconPath = new vscode.ThemeIcon("alert");
      items.push(incidentItem);
    }

    // Dependencies section
    if (this.insights?.dependencies && this.insights.dependencies.length > 0) {
      const depItem = new DevGridTreeItem(
        `Dependencies (${this.insights.dependencies.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        "section:dependencies"
      );
      depItem.iconPath = new vscode.ThemeIcon("library");
      items.push(depItem);
    }

    return items;
  }

  /**
   * Gets child items for a given element
   */
  private getChildItems(element: DevGridTreeItem): DevGridTreeItem[] {
    if (!this.insights) {
      return [];
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
        if (element.contextValue?.startsWith("vulnerability-group:")) {
          return this.getVulnerabilityGroupItems(element.contextValue);
        }
        return [];
    }
  }

  /**
   * Gets repository items
   */
  private getRepositoryItems(): DevGridTreeItem[] {
    if (!this.insights?.repository) {
      return [DevGridTreeItem.empty("No repository information available.")];
    }

    const repo = this.insights.repository;
    const items: DevGridTreeItem[] = [];

    if (repo.slug) {
      items.push(new DevGridTreeItem(`Slug: ${repo.slug}`, vscode.TreeItemCollapsibleState.None));
    }
    if (repo.url) {
      const urlItem = new DevGridTreeItem(
        `URL: ${repo.url}`,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        {
          command: "vscode.open",
          title: "Open Repository",
          arguments: [vscode.Uri.parse(repo.url)],
        }
      );
      items.push(urlItem);
    }
    if (repo.description) {
      items.push(new DevGridTreeItem(`Description: ${repo.description}`, vscode.TreeItemCollapsibleState.None));
    }

    return items;
  }

  /**
   * Gets component items
   */
  private getComponentItems(): DevGridTreeItem[] {
    if (!this.insights?.component) {
      return [DevGridTreeItem.empty("No component information available.")];
    }

    const component = this.insights.component;
    const items: DevGridTreeItem[] = [];

    if (component.slug) {
      items.push(new DevGridTreeItem(`Slug: ${component.slug}`, vscode.TreeItemCollapsibleState.None));
    }
    if (component.description) {
      items.push(new DevGridTreeItem(`Description: ${component.description}`, vscode.TreeItemCollapsibleState.None));
    }

    return items;
  }

  /**
   * Gets application items
   */
  private getApplicationItems(): DevGridTreeItem[] {
    if (!this.insights?.application) {
      return [DevGridTreeItem.empty("No application information available.")];
    }

    const app = this.insights.application;
    const items: DevGridTreeItem[] = [];

    if (app.slug) {
      items.push(new DevGridTreeItem(`Slug: ${app.slug}`, vscode.TreeItemCollapsibleState.None));
    }
    if (app.description) {
      items.push(new DevGridTreeItem(`Description: ${app.description}`, vscode.TreeItemCollapsibleState.None));
    }

    return items;
  }

  /**
   * Gets vulnerability items grouped by criticality
   */
  private getVulnerabilityItems(): DevGridTreeItem[] {
    if (!this.insights) {
      return [];
    }

    if (this.insights.vulnerabilities.length === 0) {
      return [DevGridTreeItem.empty("No active vulnerabilities.")];
    }

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

    const criticalityOrder = ["critical", "high", "medium", "low", "unknown"];
    const items: DevGridTreeItem[] = [];

    for (const criticality of criticalityOrder) {
      const vulnerabilities = vulnerabilitiesByCriticality[criticality];
      if (vulnerabilities && vulnerabilities.length > 0) {
        const criticalityLabel = criticality.toUpperCase();
        const count = vulnerabilities.length;

        const groupItem = new DevGridTreeItem(
          `${criticalityLabel} (${count})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          `vulnerability-group:${criticality}`
        );
        groupItem.iconPath = new vscode.ThemeIcon(severityToIcon(criticality));
        items.push(groupItem);
      }
    }

    return items;
  }

  /**
   * Gets vulnerability group items
   */
  private getVulnerabilityGroupItems(contextValue: string): DevGridTreeItem[] {
    if (!this.insights) {
      return [];
    }

    const criticality = contextValue.replace("vulnerability-group:", "");
    const vulnerabilities = this.insights.vulnerabilities.filter(
      (vulnerability) => (vulnerability.severity?.toLowerCase() || "unknown") === criticality
    );

    return vulnerabilities.map((vulnerability) => createVulnerabilityItem(vulnerability));
  }

  /**
   * Gets incident items
   */
  private getIncidentItems(): DevGridTreeItem[] {
    if (!this.insights?.incidents) {
      return [DevGridTreeItem.empty("No incidents available.")];
    }

    if (this.insights.incidents.length === 0) {
      return [DevGridTreeItem.empty("No active incidents.")];
    }

    return this.insights.incidents.map((incident) => createIncidentItem(incident));
  }

  /**
   * Gets dependency items
   */
  private getDependencyItems(): DevGridTreeItem[] {
    if (!this.insights?.dependencies) {
      return [DevGridTreeItem.empty("No dependencies available.")];
    }

    if (this.insights.dependencies.length === 0) {
      return [DevGridTreeItem.empty("No dependencies found.")];
    }

    return this.insights.dependencies.map((dependency) => createDependencyItem(dependency));
  }
}

/**
 * Helper function to get icon for severity
 */
function severityToIcon(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "error";
    case "high":
      return "warning";
    case "medium":
      return "info";
    case "low":
      return "symbol-information";
    default:
      return "question";
  }
}

/**
 * Creates a vulnerability tree item
 */
function createVulnerabilityItem(vulnerability: DevGridVulnerability): DevGridTreeItem {
  const item = new DevGridTreeItem(
    vulnerability.title,
    vscode.TreeItemCollapsibleState.None,
    "vulnerability"
  );

  item.iconPath = new vscode.ThemeIcon(severityToIcon(vulnerability.severity || "unknown"));
  
  if (vulnerability.referenceUrl) {
    const itemWithCommand = new DevGridTreeItem(
      vulnerability.title,
      vscode.TreeItemCollapsibleState.None,
      "vulnerability",
      {
        command: "vscode.open",
        title: "Open Vulnerability Details",
        arguments: [vscode.Uri.parse(vulnerability.referenceUrl)],
      }
    );
    itemWithCommand.iconPath = new vscode.ThemeIcon(severityToIcon(vulnerability.severity || "unknown"));
    return itemWithCommand;
  }

  const details: string[] = [];
  if (vulnerability.packageName) {
    details.push(`Package: ${vulnerability.packageName}`);
  }
  if (vulnerability.versionRange) {
    details.push(`Version: ${vulnerability.versionRange}`);
  }
  if (vulnerability.status) {
    details.push(`Status: ${vulnerability.status}`);
  }

  if (details.length > 0) {
    item.tooltip = details.join("\n");
  }

  return item;
}

/**
 * Creates an incident tree item
 */
function createIncidentItem(incident: DevGridIncident): DevGridTreeItem {
  const item = new DevGridTreeItem(
    incident.title,
    vscode.TreeItemCollapsibleState.None,
    "incident"
  );

  item.iconPath = new vscode.ThemeIcon("alert");
  
  if (incident.url) {
    const itemWithCommand = new DevGridTreeItem(
      incident.title,
      vscode.TreeItemCollapsibleState.None,
      "incident",
      {
        command: "vscode.open",
        title: "Open Incident Details",
        arguments: [vscode.Uri.parse(incident.url)],
      }
    );
    itemWithCommand.iconPath = new vscode.ThemeIcon("alert");
    return itemWithCommand;
  }

  const details: string[] = [];
  if (incident.state) {
    details.push(`State: ${incident.state}`);
  }
  if (incident.openedAt) {
    details.push(`Opened: ${new Date(incident.openedAt).toLocaleDateString()}`);
  }
  if (incident.closedAt) {
    details.push(`Closed: ${new Date(incident.closedAt).toLocaleDateString()}`);
  }

  if (details.length > 0) {
    item.tooltip = details.join("\n");
  }

  return item;
}

/**
 * Creates a dependency tree item
 */
function createDependencyItem(dependency: DevGridDependency): DevGridTreeItem {
  const item = new DevGridTreeItem(
    dependency.name,
    vscode.TreeItemCollapsibleState.None,
    "dependency"
  );

  item.iconPath = new vscode.ThemeIcon("library");
  
  if (dependency.url) {
    const itemWithCommand = new DevGridTreeItem(
      dependency.name,
      vscode.TreeItemCollapsibleState.None,
      "dependency",
      {
        command: "vscode.open",
        title: "Open Dependency Details",
        arguments: [vscode.Uri.parse(dependency.url)],
      }
    );
    itemWithCommand.iconPath = new vscode.ThemeIcon("library");
    return itemWithCommand;
  }

  const details: string[] = [];
  if (dependency.version) {
    details.push(`Version: ${dependency.version}`);
  }
  if (dependency.type) {
    details.push(`Type: ${dependency.type}`);
  }
  if (dependency.latestVersion) {
    details.push(`Latest: ${dependency.latestVersion}`);
  }

  if (details.length > 0) {
    item.tooltip = details.join("\n");
  }

  return item;
}
