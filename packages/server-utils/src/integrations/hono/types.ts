/**
 * Middleware-specific options shared across all Hono runtime adapters.
 * These options are distinct from the SDK initialization options (DSN, sample rates, etc.).
 */
export interface SentryHonoMiddlewareOptions {
  /**
   * Determines whether a given Hono error thrown in the response should be captured and sent to Sentry.
   *
   * When not provided, the default behavior applies: 3xx and 4xx HTTP errors are
   * considered expected and are not captured. All other errors are captured.
   *
   * @example
   * // Capture everything, including 4xx errors:
   * shouldHandleError: () => true
   *
   * @example
   * // Capture only 5xx errors and suppress everything else:
   * shouldHandleError: (err) => {
   *   const status = (err as { status?: number })?.status;
   *   return typeof status === 'number' ? status >= 500 : true;
   * }
   */
  shouldHandleError?: (error: unknown) => boolean;
}
