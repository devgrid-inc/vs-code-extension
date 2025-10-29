/**
 * Template rendering utilities
 */

/**
 * Renders a template string with variable substitution
 * @param template - The template string with {variable} placeholders
 * @param context - The context object with variable values
 * @returns The rendered string
 * @example
 * renderTemplate('/repos/{repositoryId}', { repositoryId: '123' }) // '/repos/123'
 * renderTemplate('Hello {name}!', { name: 'World' }) // 'Hello World!'
 */
export function renderTemplate(template: string, context: Record<string, string | undefined>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = context[key];
    return value ?? '';
  });
}

/**
 * Validates that all required variables are present in the context
 * @param template - The template string
 * @param context - The context object
 * @returns True if all required variables are present, false otherwise
 * @example
 * validateTemplate('/repos/{repositoryId}', { repositoryId: '123' }) // true
 * validateTemplate('/repos/{repositoryId}', {}) // false
 */
export function validateTemplate(template: string, context: Record<string, string | undefined>): boolean {
  const matches = template.match(/\{([^}]+)\}/g);
  if (!matches) {
    return true; // No placeholders to validate
  }

  for (const match of matches) {
    const key = match.slice(1, -1); // Remove { and }
    if (!context[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Extracts all variable names from a template string
 * @param template - The template string
 * @returns Array of variable names
 * @example
 * extractTemplateVariables('/repos/{repositoryId}/components/{componentId}') // ['repositoryId', 'componentId']
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{([^}]+)\}/g);
  if (!matches) {
    return [];
  }

  return matches.map(match => match.slice(1, -1)); // Remove { and }
}

/**
 * Renders a template with fallback values for missing variables
 * @param template - The template string with {variable} placeholders
 * @param context - The context object with variable values
 * @param fallbacks - Fallback values for missing variables
 * @returns The rendered string
 * @example
 * renderTemplateWithFallbacks('/repos/{repositoryId}', { repositoryId: '123' }, { repositoryId: 'default' }) // '/repos/123'
 * renderTemplateWithFallbacks('/repos/{repositoryId}', {}, { repositoryId: 'default' }) // '/repos/default'
 */
export function renderTemplateWithFallbacks(
  template: string,
  context: Record<string, string | undefined>,
  fallbacks: Record<string, string>
): string {
  const mergedContext = { ...fallbacks, ...context };
  return renderTemplate(template, mergedContext);
}

/**
 * Renders multiple templates and returns the first one that can be fully rendered
 * @param templates - Array of template strings
 * @param context - The context object with variable values
 * @returns The first fully renderable template or undefined if none can be rendered
 * @example
 * renderFirstValidTemplate(['/repos/{repositoryId}', '/repos/{repositorySlug}'], { repositoryId: '123' }) // '/repos/123'
 */
export function renderFirstValidTemplate(
  templates: string[],
  context: Record<string, string | undefined>
): string | undefined {
  for (const template of templates) {
    if (validateTemplate(template, context)) {
      return renderTemplate(template, context);
    }
  }
  return undefined;
}

/**
 * Escapes special characters in a string for use in templates
 * @param str - The string to escape
 * @returns The escaped string
 * @example
 * escapeTemplateString('Hello {world}') // 'Hello \\{world\\}'
 */
export function escapeTemplateString(str: string): string {
  return str.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/**
 * Unescapes special characters in a template string
 * @param str - The string to unescape
 * @returns The unescaped string
 * @example
 * unescapeTemplateString('Hello \\{world\\}') // 'Hello {world}'
 */
export function unescapeTemplateString(str: string): string {
  return str.replace(/\\{/g, '{').replace(/\\}/g, '}');
}
