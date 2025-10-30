import { describe, it, expect } from 'vitest';
import { buildRemediationPrompt } from '../../utils/promptUtils';
import type { DevGridVulnerabilityDetails } from '../../types';

describe('buildRemediationPrompt', () => {
  it('should build a complete remediation prompt with all fields', () => {
    const details: DevGridVulnerabilityDetails = {
      id: 'vuln-123',
      title: 'Critical Security Vulnerability',
      severity: 'critical',
      status: 'open',
      packageName: 'lodash',
      versionRange: '>=4.0.0 <4.17.20',
      publishedAt: '2023-01-15T10:00:00Z',
      referenceUrl: 'https://cve.example.com/CVE-2023-12345',
      identifiers: [
        {
          type: 'CVE',
          value: 'CVE-2023-12345',
          url: 'https://cve.example.com/CVE-2023-12345'
        },
        {
          type: 'CWE',
          value: 'CWE-79',
          url: 'https://cwe.mitre.org/data/definitions/79.html'
        }
      ],
      cvss: {
        baseScore: 9.1,
        vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N'
      },
      description: 'This vulnerability allows remote code execution via prototype pollution.',
      remediation: {
        fixedVersion: '4.17.20',
        advice: 'Update to version 4.17.20 or later'
      },
      references: [
        { title: 'Advisory', url: 'https://example.com/advisory' },
        { title: 'Fix Commit', url: 'https://github.com/lodash/lodash/commit/abc123' }
      ],
      originatingSystem: 'SCA Scanner',
      originatingSystemId: 'sca-123',
      scanType: 'dependency-scan',
      location: 'package.json',
      openDate: '2023-01-15T10:00:00Z',
      closeDate: undefined,
      vulnerableId: 'component-456',
      vulnerableType: 'component'
    };

    const prompt = buildRemediationPrompt(details);

    expect(prompt).toContain('## Vulnerability Analysis: Critical Security Vulnerability');
    expect(prompt).toContain('**Severity:** CRITICAL');
    expect(prompt).toContain('**CVSS Score:** 9.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)');
    expect(prompt).toContain('### Affected Package');
    expect(prompt).toContain('**Package:** lodash');
    expect(prompt).toContain('**Version Range:** >=4.0.0 <4.17.20');
    expect(prompt).toContain('**Status:** open');
    expect(prompt).toContain('**Published:** 2023-01-15T10:00:00Z');
    expect(prompt).toContain('### Vulnerability Identifiers');
    expect(prompt).toContain('- **CVE:** CVE-2023-12345');
    expect(prompt).toContain('- **CWE:** CWE-79');
    expect(prompt).toContain('### Description');
    expect(prompt).toContain('This vulnerability allows remote code execution via prototype pollution.');
    expect(prompt).toContain('### Current Remediation');
    expect(prompt).toContain('**Fixed Version:** 4.17.20');
    expect(prompt).toContain('**Advice:** Update to version 4.17.20 or later');
    expect(prompt).toContain('### References');
    expect(prompt).toContain('- Advisory: https://example.com/advisory');
    expect(prompt).toContain('### Additional Context');
    expect(prompt).toContain('Originating System: SCA Scanner');
    expect(prompt).toContain('Scan Type: dependency-scan');
    expect(prompt).toContain('### Request');
    expect(prompt).toContain('Please analyze this vulnerability and provide:');
    expect(prompt).toContain('1. **Risk Assessment**: What are the potential impacts and exploitability?');
    expect(prompt).toContain('2. **Remediation Steps**: Specific commands and changes needed to fix this vulnerability');
  });

  it('should handle minimal vulnerability details', () => {
    const details: DevGridVulnerabilityDetails = {
      id: 'vuln-456',
      title: 'Simple Vulnerability',
      severity: 'medium'
    };

    const prompt = buildRemediationPrompt(details);

    expect(prompt).toContain('## Vulnerability Analysis: Simple Vulnerability');
    expect(prompt).toContain('**Severity:** MEDIUM');
    expect(prompt).not.toContain('### Affected Package');
    expect(prompt).not.toContain('### Vulnerability Identifiers');
    expect(prompt).not.toContain('### Description');
    expect(prompt).toContain('### Request');
  });

  it('should handle vulnerability with only identifiers', () => {
    const details: DevGridVulnerabilityDetails = {
      id: 'vuln-789',
      title: 'Identifier Only Vulnerability',
      severity: 'high',
      identifiers: [
        {
          type: 'CVE',
          value: 'CVE-2023-99999'
        }
      ]
    };

    const prompt = buildRemediationPrompt(details);

    expect(prompt).toContain('### Vulnerability Identifiers');
    expect(prompt).toContain('- **CVE:** CVE-2023-99999');
    expect(prompt).not.toContain('Reference:');
  });

  it('should handle vulnerability with CVSS but no vector', () => {
    const details: DevGridVulnerabilityDetails = {
      id: 'vuln-cvss',
      title: 'CVSS Only Vulnerability',
      severity: 'low',
      cvss: {
        baseScore: 5.5
      }
    };

    const prompt = buildRemediationPrompt(details);

    expect(prompt).toContain('**CVSS Score:** 5.5');
    expect(prompt).not.toContain('CVSS:3.1');
  });

  it('should handle vulnerability with remediation but no fixed version', () => {
    const details: DevGridVulnerabilityDetails = {
      id: 'vuln-remediation',
      title: 'Remediation Vulnerability',
      severity: 'high',
      remediation: {
        advice: 'Avoid using this function in untrusted contexts'
      }
    };

    const prompt = buildRemediationPrompt(details);

    expect(prompt).toContain('### Current Remediation');
    expect(prompt).toContain('**Advice:** Avoid using this function in untrusted contexts');
    expect(prompt).not.toContain('**Fixed Version:**');
  });

  it('should handle vulnerability with multiple metadata fields', () => {
    const details: DevGridVulnerabilityDetails = {
      id: 'vuln-meta',
      title: 'Metadata Vulnerability',
      severity: 'medium',
      originatingSystem: 'SAST Scanner',
      scanType: 'code-scan',
      location: 'src/main.js',
      openDate: '2023-06-01T00:00:00Z',
      closeDate: '2023-06-15T00:00:00Z'
    };

    const prompt = buildRemediationPrompt(details);

    expect(prompt).toContain('### Additional Context');
    expect(prompt).toContain('Originating System: SAST Scanner');
    expect(prompt).toContain('Scan Type: code-scan');
    expect(prompt).toContain('Location: src/main.js');
    expect(prompt).toContain('Open Date: 2023-06-01T00:00:00Z');
    expect(prompt).toContain('Close Date: 2023-06-15T00:00:00Z');
  });

  it('should escape special characters in text fields', () => {
    const details: DevGridVulnerabilityDetails = {
      id: 'vuln-escape',
      title: 'Vulnerability with <script> tags',
      severity: 'critical',
      description: 'This has "quotes" and \'apostrophes\' and <html> tags',
      packageName: 'bad&package'
    };

    const prompt = buildRemediationPrompt(details);

    // The function should not escape HTML in the prompt output since it's plain text
    expect(prompt).toContain('Vulnerability with <script> tags');
    expect(prompt).toContain('This has "quotes" and \'apostrophes\' and <html> tags');
    expect(prompt).toContain('**Package:** bad&package');
  });
});
