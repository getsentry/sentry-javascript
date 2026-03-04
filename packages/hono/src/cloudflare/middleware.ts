import { withSentry } from '@sentry/cloudflare';
import {
  applySdkMetadata,
  type BaseTransportOptions,
  debug,
  getIntegrationsToSetup,
  type Integration,
  type Options,
} from '@sentry/core';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { requestHandler, responseHandler } from '../shared/middlewareHandlers';

export interface HonoOptions extends Options<BaseTransportOptions> {
  context?: Context;
}

const filterHonoIntegration = (integration: Integration): boolean => integration.name !== 'Hono';

export const sentry = (app: Hono, options: HonoOptions | undefined = {}): MiddlewareHandler => {
  const isDebug = options.debug;

  isDebug && debug.log('Initialized Sentry Hono middleware (Cloudflare)');

  applySdkMetadata(options, 'hono');

  const { integrations: userIntegrations } = options;
  withSentry(
    () => ({
      ...options,
      // Always filter out the Hono integration from defaults and user integrations.
      // The Hono integration is already set up by withSentry, so adding it again would cause capturing too early (in Cloudflare SDK) and non-parametrized URLs.
      integrations: Array.isArray(userIntegrations)
        ? defaults =>
            getIntegrationsToSetup({
              defaultIntegrations: defaults.filter(filterHonoIntegration),
              integrations: userIntegrations.filter(filterHonoIntegration),
            })
        : typeof userIntegrations === 'function'
          ? defaults => userIntegrations(defaults).filter(filterHonoIntegration)
          : defaults => defaults.filter(filterHonoIntegration),
    }),
    app,
  );

  return async (context, next) => {
    requestHandler(context);

    await next(); // Handler runs in between Request above ⤴ and Response below ⤵

    responseHandler(context);
  };
};
