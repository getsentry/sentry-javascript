import { _INTERNAL_getActiveClient as getActiveClient, applySdkMetadata, consoleSandbox, debug } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import {
  _INTERNAL_installTunnelHooks as installTunnelHooks,
  getDefaultIntegrations as getDefaultNodeIntegrations,
  init as initNodeSdk,
} from '@sentry/node';

/**
 * Initializes the server side of the TanStack Start React SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  // TanStack Start prerenders by running the server at build time.
  if (process.env.TSS_PRERENDERING === 'true') {
    debug.log('Detected a TanStack Start prerender build. Skipping Sentry server initialization.');
    return undefined;
  }

  // The Nitro server build also runs `instrument.server` when it starts, so a `node --import` preload of it or an
  // import of it in the server entry initializes the SDK a second time. The first init wins.
  const activeClient = getActiveClient<NodeClient>();
  if (activeClient) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.log(
        '[Sentry] The Sentry server SDK is already initialized, skipping a second initialization. With Nitro, the server build loads `instrument.server` when the server starts, so a `node --import` preload of it or an import of it in the server entry is no longer needed and can be removed.',
      );
    });
    return activeClient;
  }

  const sentryOptions: NodeOptions = {
    defaultIntegrations: [...getDefaultNodeIntegrations(options)],
    ...options,
  };

  applySdkMetadata(sentryOptions, 'tanstackstart-react', ['tanstackstart-react', 'node']);

  sentryOptions.ignoreSpans = [
    ...(sentryOptions.ignoreSpans || []),
    /\/node_modules\//,
    /\/@id\//,
    /\/@react-refresh/,
    /\/@vite\//,
  ];

  const client = initNodeSdk(sentryOptions);
  // `tunnelRoute` enables the tunnel when the server entry loads, after this preload, so the servers must be ready to
  // answer it already.
  installTunnelHooks();

  return client;
}
