import { bunHttpServerIntegration, fetchIntegration } from '@sentry/bun';
import { _INTERNAL_captureOptionsSetByUser } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initServer } from './server/sdk';

// oxlint-disable-next-line typescript/no-deprecated
export { default } from './index.server';
export * from './index.server';

/** Inits the Sentry Astro SDK on Bun, with the integrations of `@sentry/bun` for what Bun does differently. */
export function init(options: NodeOptions): NodeClient | undefined {
  const userOptions = _INTERNAL_captureOptionsSetByUser(options);
  const userIntegrations = userOptions.integrations;
  return initServer({
    runtime: { name: 'bun', version: process.versions.bun as string },
    ...userOptions,
    integrations: defaults => {
      const integrations = [
        // The `fetch` of Bun is not undici.
        ...defaults.filter(integration => integration.name !== 'NodeFetch'),
        fetchIntegration(),
        // Bun does not publish `http.server.request.start`, which `httpIntegration` needs for request isolation and spans.
        bunHttpServerIntegration(),
      ];
      return typeof userIntegrations === 'function'
        ? userIntegrations(integrations)
        : [...integrations, ...(userIntegrations || [])];
    },
  });
}
