import type * as vscode from 'vscode';

/**
 * Virtual document provider for DevGrid diagnostics with unknown locations
 * Uses the 'devgrid:' URI scheme to provide a clean anchor point for diagnostics
 * that don't have specific file locations.
 */
export class VirtualDocumentProvider implements vscode.TextDocumentContentProvider {
  /**
   * Provides content for the virtual document
   */
  provideTextDocumentContent(uri: vscode.Uri): string {
    // For the ambiguous location document, provide a simple explanation
    if (uri.path === 'DevGrid Tracked Vulnerability - Ambiguous Location') {
      return `DevGrid: Vulnerabilities with Unknown Location

This virtual document contains diagnostics for vulnerabilities that could not be mapped to a specific file location.

These vulnerabilities are still important to address, but their precise location within the codebase could not be determined.
`;
    }

    // Default content for any other devgrid: URIs
    return `DevGrid Virtual Document: ${uri.toString()}`;
  }
}
