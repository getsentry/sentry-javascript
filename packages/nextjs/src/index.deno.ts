import { fetchIntegration } from '@sentry/deno';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initServer } from './server';

export * from './server';

/** Inits the Sentry Next.js SDK on Deno, with the integrations of `@sentry/deno` for what Deno does differently. */
export function init(options: NodeOptions): NodeClient | undefined {
  const userIntegrations = options.integrations;
  return initServer({
    runtime: { name: 'deno', version: process.versions.deno as string },
    ...options,
    integrations: defaults => {
      const integrations = [
        // The `fetch` of Deno is not undici.
        ...defaults.filter(integration => integration.name !== 'NodeFetch'),
        fetchIntegration(),
      ];
      return typeof userIntegrations === 'function'
        ? userIntegrations(integrations)
        : [...integrations, ...(userIntegrations || [])];
    },
  });
}
