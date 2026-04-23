import { withSentry } from '@sentry/cloudflare';
import { applySdkMetadata, type BaseTransportOptions, debug, type Options } from '@sentry/core';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';
import { applyPatches } from '../shared/applyPatches';

export interface HonoCloudflareOptions extends Options<BaseTransportOptions> {}

/**
 * Sentry middleware for Hono on Cloudflare Workers.
 */
export function sentry<E extends Env>(
  app: Hono<E>,
  options: HonoCloudflareOptions | ((env: E['Bindings']) => HonoCloudflareOptions),
): MiddlewareHandler {
  withSentry(
    env => {
      const honoOptions = typeof options === 'function' ? options(env as E['Bindings']) : options;

      applySdkMetadata(honoOptions, 'hono', ['hono', 'cloudflare']);

      honoOptions.debug && debug.log('Initialized Sentry Hono middleware (Cloudflare)');

      return {
        ...honoOptions,
        // Always filter out the Hono integration from defaults and user integrations.
        // The Hono integration is already set up by withSentry, so adding it again would cause capturing too early (in Cloudflare SDK) and non-parametrized URLs.
        integrations: buildFilteredIntegrations(honoOptions.integrations, true),
      };
    },
    // Cast needed because Hono<E> exposes a narrower fetch signature than ExportedHandler<unknown>
    app as unknown as ExportedHandler<unknown>,
  );

  applyPatches(app);

  return async (context, next) => {
    requestHandler(context);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context);
  };
}
