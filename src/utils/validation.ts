/**
 * Utility functions for input validation
 */

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a string looks like a valid vulnerability identifier
 * Accepts UUIDs and CVE patterns
 */
export function isValidVulnerabilityId(id: string): boolean {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    return false;
  }

  const trimmed = id.trim();

  // UUID pattern (with or without dashes)
  const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmed)) {
    return true;
  }

  // CVE pattern
  const cvePattern = /^CVE-\d{4}-\d{4,}$/i;
  if (cvePattern.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Validates and sanitizes an API URL
 */
export function validateApiUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('API URL must be a non-empty string');
  }

  const trimmed = url.trim();
  if (!isValidUrl(trimmed)) {
    throw new Error(`Invalid API URL: ${url}`);
  }

  // Ensure it has a protocol
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    throw new Error(`API URL must use HTTP or HTTPS protocol: ${url}`);
  }

  return trimmed;
}

/**
 * Validates a configuration value is within acceptable range
 */
export function validateMaxItems(value: number): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('maxItemsPerSection must be a number');
  }

  if (value < 1 || value > 50) {
    throw new Error('maxItemsPerSection must be between 1 and 50');
  }

  return Math.floor(value);
}
