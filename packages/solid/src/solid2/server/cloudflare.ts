import type { CloudflareOptions } from '@sentry/cloudflare';
import { defineCloudflareOptions as defineCloudflareOptionsBase } from '@sentry/cloudflare';
import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata } from '@sentry/core';
import { solidServerErrorsIntegration } from './errors';

/**
 * Defines the Sentry options for a Solid 2 app on Cloudflare Workers, like `defineCloudflareOptions` of
 * `@sentry/cloudflare`, and adds Solid's server integrations to the default integrations.
 *
 * @example
 * ```ts
 * // instrument.server.ts
 * import { defineCloudflareOptions } from '@sentry/solid/solid2/cloudflare';
 *
 * export default defineCloudflareOptions(env => ({
 *   dsn: env.SENTRY_DSN,
 *   tracesSampleRate: 1.0,
 * }));
 * ```
 */
export const defineCloudflareOptions: typeof defineCloudflareOptionsBase = (
  optionsOrCallback: CloudflareOptions | ((env: unknown) => CloudflareOptions | undefined),
) => {
  const getOptions = defineCloudflareOptionsBase(optionsOrCallback as CloudflareOptions);

  return (env: unknown): CloudflareOptions | undefined => {
    const options = getOptions(env);
    if (!options) {
      return undefined;
    }

    // Captured before the Solid integrations are added, so they are not reported as the user's.
    const opts: CloudflareOptions = { ..._INTERNAL_captureOptionsSetByUser(options) };
    // Added through `integrations` rather than a prebuilt `defaultIntegrations` list: the Cloudflare SDK builds its
    // defaults at `init`, after wrappers such as `instrumentWorkflowWithSentry` changed the options they depend on.
    if (opts.defaultIntegrations === undefined) {
      const userIntegrations = opts.integrations;
      opts.integrations = defaults => {
        const withSolid = [...defaults, solidServerErrorsIntegration()];
        return typeof userIntegrations === 'function'
          ? userIntegrations(withSolid)
          : [...withSolid, ...(userIntegrations ?? [])];
      };
    }

    applySdkMetadata(opts, 'solid', ['solid', 'cloudflare']);

    return opts;
  };
};
