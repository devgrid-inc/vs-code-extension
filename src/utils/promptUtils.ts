import type { DevGridVulnerabilityDetails } from '../types';

/**
 * Builds a remediation-focused prompt for chat bots from vulnerability details.
 * Includes key information for security analysis and remediation planning.
 */
export function buildRemediationPrompt(details: DevGridVulnerabilityDetails): string {
  const parts: string[] = [];

  // Header with title and severity
  parts.push(`## Vulnerability Analysis: ${details.title}`);
  parts.push('');

  // Severity and CVSS
  if (details.severity) {
    parts.push(`**Severity:** ${details.severity.toUpperCase()}`);
    if (details.cvss?.baseScore) {
      parts.push(`**CVSS Score:** ${details.cvss.baseScore.toFixed(1)}${details.cvss.vector ? ` (${details.cvss.vector})` : ''}`);
    }
  }
  parts.push('');

  // Package information
  if (details.packageName || details.versionRange) {
    parts.push('### Affected Package');
    if (details.packageName) {
      parts.push(`**Package:** ${details.packageName}`);
    }
    if (details.versionRange) {
      parts.push(`**Version Range:** ${details.versionRange}`);
    }
    parts.push('');
  }

  // Status and dates
  if (details.status) {
    parts.push(`**Status:** ${details.status}`);
  }
  if (details.publishedAt) {
    parts.push(`**Published:** ${details.publishedAt}`);
  }
  parts.push('');

  // Vulnerability identifiers
  if (details.identifiers && details.identifiers.length > 0) {
    parts.push('### Vulnerability Identifiers');
    details.identifiers.forEach(identifier => {
      parts.push(`- **${identifier.type}:** ${identifier.value}`);
      if (identifier.url) {
        parts.push(`  - Reference: ${identifier.url}`);
      }
    });
    parts.push('');
  }

  // Description
  if (details.description) {
    parts.push('### Description');
    parts.push(details.description);
    parts.push('');
  }

  // Remediation information if available
  if (details.remediation) {
    parts.push('### Current Remediation');
    if (details.remediation.fixedVersion) {
      parts.push(`**Fixed Version:** ${details.remediation.fixedVersion}`);
    }
    if (details.remediation.advice) {
      parts.push(`**Advice:** ${details.remediation.advice}`);
    }
    parts.push('');
  }

  // References
  if (details.referenceUrl) {
    parts.push('### References');
    parts.push(`- ${details.referenceUrl}`);
    if (details.references && details.references.length > 0) {
      details.references.forEach(ref => {
        parts.push(`- ${ref.title || 'Reference'}: ${ref.url}`);
      });
    }
    parts.push('');
  }

  // Additional metadata
  const metadataParts: string[] = [];
  if (details.originatingSystem) {
    metadataParts.push(`Originating System: ${details.originatingSystem}`);
  }
  if (details.originatingSystemId) {
    metadataParts.push(`Originating System ID: ${details.originatingSystemId}`);
  }
  if (details.scanType) {
    metadataParts.push(`Scan Type: ${details.scanType}`);
  }
  if (details.location) {
    metadataParts.push(`Location: ${details.location}`);
  }
  if (details.openDate) {
    metadataParts.push(`Open Date: ${details.openDate}`);
  }
  if (details.closeDate) {
    metadataParts.push(`Close Date: ${details.closeDate}`);
  }
  if (details.vulnerableId) {
    metadataParts.push(`Vulnerable ID: ${details.vulnerableId}`);
  }
  if (details.vulnerableType) {
    metadataParts.push(`Vulnerable Type: ${details.vulnerableType}`);
  }
  if (metadataParts.length > 0) {
    parts.push('### Additional Context');
    metadataParts.forEach(part => parts.push(`- ${part}`));
    parts.push('');
  }

  // Explicit ask for remediation steps
  parts.push('### Request');
  parts.push('Please analyze this vulnerability and provide:');
  parts.push('1. **Risk Assessment**: What are the potential impacts and exploitability?');
  parts.push('2. **Remediation Steps**: Specific commands and changes needed to fix this vulnerability');
  parts.push('3. **Code Changes**: What files need to be modified and how?');
  parts.push('4. **Testing**: How to verify the fix works correctly');
  parts.push('5. **Prevention**: How to avoid similar issues in the future');
  if (details.packageName) {
    parts.push('6. **Alternatives**: Are there safer alternative packages or versions?');
  }
  parts.push('');
  parts.push('Please be specific about file paths, commands, and code changes needed.');

  return parts.join('\n');
}
