import { bunHttpServerIntegration, fetchIntegration } from '@sentry/bun';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initServer } from './server';

export * from './server';

/** Inits the Sentry Next.js SDK on Bun, with the integrations of `@sentry/bun` for what Bun does differently. */
export function init(options: NodeOptions): NodeClient | undefined {
  const userIntegrations = options.integrations;
  return initServer({
    runtime: { name: 'bun', version: process.versions.bun as string },
    ...options,
    integrations: defaults => {
      const integrations = [
        // The `fetch` of Bun is not undici.
        ...defaults.filter(integration => integration.name !== 'NodeFetch'),
        fetchIntegration(),
        // Bun does not publish `http.server.request.start`. Next.js creates its own request spans.
        bunHttpServerIntegration({ spans: false }),
      ];
      return typeof userIntegrations === 'function'
        ? userIntegrations(integrations)
        : [...integrations, ...(userIntegrations || [])];
    },
  });
}
