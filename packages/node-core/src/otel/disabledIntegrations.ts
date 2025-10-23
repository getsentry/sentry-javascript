/**
 * Registry to track disabled integrations.
 * This is used to prevent duplicate instrumentation when higher-level integrations
 * (like LangChain) already instrument the underlying libraries (like OpenAI, Anthropic, etc.)
 */

const DISABLED_INTEGRATIONS = new Set<string>();

/**
 * Mark one or more integrations as disabled to prevent their instrumentation from being set up.
 * @param integrationName The name(s) of the integration(s) to disable
 */
export function disableIntegrations(integrationName: string | string[]): void {
  if (Array.isArray(integrationName)) {
    integrationName.forEach(name => DISABLED_INTEGRATIONS.add(name));
  } else {
    DISABLED_INTEGRATIONS.add(integrationName);
  }
}

/**
 * Check if an integration has been disabled.
 * @param integrationName The name of the integration to check
 * @returns true if the integration is disabled
 */
export function isIntegrationDisabled(integrationName: string): boolean {
  return DISABLED_INTEGRATIONS.has(integrationName);
}

/**
 * Remove one or more integrations from the disabled list.
 * @param integrationName The name(s) of the integration(s) to enable
 */
export function enableIntegration(integrationName: string | string[]): void {
  if (Array.isArray(integrationName)) {
    integrationName.forEach(name => DISABLED_INTEGRATIONS.delete(name));
  } else {
    DISABLED_INTEGRATIONS.delete(integrationName);
  }
}

/** Exported only for tests. */
export function clearDisabledIntegrations(): void {
  DISABLED_INTEGRATIONS.clear();
}
