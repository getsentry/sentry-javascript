import type { CloudflareOptions, defineCloudflareOptions as defineCloudflareSdkOptions } from '@sentry/cloudflare';
import { getDefaultIntegrations as getDefaultCloudflareIntegrations } from '@sentry/cloudflare';
import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { nestIntegration } from '../integrations/nest';

/**
 * Define the Sentry options for a NestJS app on Cloudflare Workers, in the `instrument.server` module
 * that the `@sentry/cloudflare/vite` plugin hands to `withSentry`.
 *
 * Works like `defineCloudflareOptions` from `@sentry/cloudflare` (same overloads), and adds the Nest integration to the
 * defaults and the NestJS SDK metadata.
 */
export const defineCloudflareOptions = (<Env>(
  optionsOrCallback: CloudflareOptions | ((env: Env) => CloudflareOptions | undefined),
): ((env: Env) => CloudflareOptions | undefined) => {
  const getOptions = typeof optionsOrCallback === 'function' ? optionsOrCallback : () => optionsOrCallback;

  return (env: Env) => {
    const options = getOptions(env);
    if (!options) {
      return options;
    }

    const opts: CloudflareOptions = {
      defaultIntegrations: getDefaultIntegrations(options),
      _extendsDefaultIntegrations: options.defaultIntegrations === undefined,
      ...options,
    };

    applySdkMetadata(opts, 'nestjs', ['nestjs', 'cloudflare']);

    return opts;
  };
}) as typeof defineCloudflareSdkOptions;

/** Get the default integrations for the NestJS SDK on Cloudflare Workers. */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  return [nestIntegration(), ...getDefaultCloudflareIntegrations(options)];
}
