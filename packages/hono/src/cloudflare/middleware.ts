import { withSentry } from '@sentry/cloudflare';
import { applySdkMetadata, type BaseTransportOptions, debug, type Options } from '@sentry/core';
import { getConnInfo } from 'hono/cloudflare-workers';
import {
  applyHonoPatches,
  createHonoRequestMiddleware,
  type SentryHonoMiddlewareOptions,
} from '@sentry/server-utils/no-diagnostic-channels';
import type { Env, Hono, MiddlewareHandler } from 'hono';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';
import { LOW_QUALITY_TRANSACTION_PATTERNS } from '../shared/lowQualityTransactionPatterns';

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
      const honoOptions = typeof options === 'function' ? options(env) : options;

      applySdkMetadata(honoOptions, 'hono', ['hono', 'cloudflare']);

      honoOptions.debug && debug.log('Initialized Sentry Hono middleware (Cloudflare)');

      // `shouldHandleError` is a middleware option, not an SDK option — it is read from
      // `options` directly in the response handler below.
      const { shouldHandleError: _shouldHandleError, ...sdkOptions } = honoOptions;

      return {
        ...sdkOptions,
        ignoreSpans: [...(honoOptions.ignoreSpans || []), ...LOW_QUALITY_TRANSACTION_PATTERNS],
        // Always filter out the Hono integration from defaults and user integrations.
        // The Hono integration is already set up by withSentry, so adding it again would cause capturing too early (in Cloudflare SDK) and non-parametrized URLs.
        integrations: buildFilteredIntegrations(honoOptions.integrations, true),
      };
    },
    // Cast needed because Hono<E> exposes a narrower fetch signature than ExportedHandler<unknown>
    app as unknown as ExportedHandler<unknown>,
  );

  applyHonoPatches(app);

  return createHonoRequestMiddleware({
    getConnInfo,
    // Cloudflare accepts middleware options as a function of `env`, so `shouldHandleError` is only
    // known per request.
    resolveShouldHandleError: context =>
      typeof options === 'function'
        ? options(context.env as E['Bindings']).shouldHandleError
        : options.shouldHandleError,
  });
}
