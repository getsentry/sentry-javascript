import { withSentry } from '@sentry/cloudflare';
import { applySdkMetadata, type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { getConnInfo } from 'hono/cloudflare-workers';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';
import { LOW_QUALITY_TRANSACTION_PATTERNS } from '../shared/lowQualityTransactionPatterns';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';
import { applyPatches } from '../shared/applyPatches';
import type { SentryHonoMiddlewareOptions } from '../shared/types';

export interface HonoCloudflareOptions extends Options<BaseTransportOptions>, SentryHonoMiddlewareOptions {}

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
        ignoreSpans: [...(honoOptions.ignoreSpans || []), ...LOW_QUALITY_TRANSACTION_PATTERNS],
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
    const shouldHandleError =
      typeof options === 'function'
        ? options(context.env as E['Bindings']).shouldHandleError
        : options.shouldHandleError;

    requestHandler(context, getConnInfo);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context, shouldHandleError);
  };
}
