/**
 * URL manipulation utilities
 */

/**
 * Converts SSH URL to HTTPS URL
 * @param url - The URL to convert
 * @returns The converted HTTPS URL
 * @example
 * convertToHttpsUrl('git@github.com:org/repo.git') // 'https://github.com/org/repo'
 * convertToHttpsUrl('https://github.com/org/repo.git') // 'https://github.com/org/repo'
 */
export function convertToHttpsUrl(url: string): string {
  if (url.startsWith('git@')) {
    return url
      .replace('git@', 'https://')
      .replace(':', '/')
      .replace(/\.git$/, '');
  }
  return url.replace(/\.git$/, '');
}

/**
 * Extracts repository name from URL
 * @param url - The URL to extract from
 * @returns The repository name (org/repo) or undefined if unable to extract
 * @example
 * extractRepoNameFromUrl('git@github.com:org/repo.git') // 'org/repo'
 * extractRepoNameFromUrl('https://github.com/org/repo.git') // 'org/repo'
 */
export function extractRepoNameFromUrl(url: string): string | undefined {
  try {
    // Handle SSH URLs: git@github.com:org/repo.git
    if (url.startsWith('git@')) {
      const match = url.match(/git@[^:]+:([^/]+\/[^/]+)(?:\.git)?$/);
      return match ? match[1] : undefined;
    }
    
    // Handle HTTPS URLs: https://github.com/org/repo.git
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname
      .split('/')
      .filter((part) => part.length > 0);
    if (pathParts.length >= 2) {
      return `${pathParts[0]}/${pathParts[1]}`;
    }
    
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Derives repository slug from remote URL
 * @param remoteUrl - The remote URL to derive the slug from
 * @returns The repository slug or undefined if unable to derive
 * @example
 * deriveRepositorySlug('git@github.com:org/repo.git') // 'org/repo'
 * deriveRepositorySlug('https://github.com/org/repo.git') // 'org/repo'
 */
export function deriveRepositorySlug(remoteUrl?: string): string | undefined {
  if (!remoteUrl) {
    return undefined;
  }

  const sshMatch = remoteUrl.match(/@(.*):(.+?)(\.git)?$/);
  if (sshMatch) {
    return sshMatch[2];
  }

  try {
    const parsed = new URL(remoteUrl);
    const slug = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    return slug || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sanitizes URL for logging by masking sensitive information
 * @param url - The URL to sanitize
 * @returns The sanitized URL
 * @example
 * sanitizeUrlForLogging('https://api.example.com/token/secret123') // 'https://api.example.com/token/***'
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Mask common sensitive path segments
    const sensitivePatterns = [
      /\/token\/[^/]+/gi,
      /\/auth\/[^/]+/gi,
      /\/key\/[^/]+/gi,
      /\/secret\/[^/]+/gi,
      /\/password\/[^/]+/gi,
    ];
    
    let sanitizedPath = urlObj.pathname;
    for (const pattern of sensitivePatterns) {
      sanitizedPath = sanitizedPath.replace(pattern, (match) => {
        const parts = match.split('/');
        parts[parts.length - 1] = '***';
        return parts.join('/');
      });
    }
    
    // Mask sensitive query parameters
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth'];
    const searchParams = new URLSearchParams(urlObj.search);
    for (const param of sensitiveParams) {
      if (searchParams.has(param)) {
        searchParams.set(param, '***');
      }
    }
    
    const sanitizedUrl = new URL(urlObj.href);
    sanitizedUrl.pathname = sanitizedPath;
    sanitizedUrl.search = searchParams.toString();
    
    return sanitizedUrl.toString();
  } catch {
    // If URL parsing fails, return a generic masked version
    return url.replace(/\/[^/]*[Tt]oken[^/]*/gi, '/***')
              .replace(/\/[^/]*[Kk]ey[^/]*/gi, '/***')
              .replace(/\/[^/]*[Ss]ecret[^/]*/gi, '/***');
  }
}

/**
 * Validates if a URL is a valid HTTP/HTTPS URL
 * @param url - The URL to validate
 * @returns True if the URL is valid, false otherwise
 */
export function isValidHttpUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Builds a URL with query parameters
 * @param baseUrl - The base URL
 * @param params - Query parameters
 * @returns The URL with query parameters
 */
export function buildUrlWithParams(baseUrl: string, params: Record<string, string | number | boolean>): string {
  const url = new URL(baseUrl);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  
  return url.toString();
}
