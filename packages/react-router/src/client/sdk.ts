import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit, WINDOW } from '@sentry/browser';
import type { Client } from '@sentry/core';
import {
  applySdkMetadata,
  _INTERNAL_applyBrowserTunnelDefaults as applyBrowserTunnelDefaults,
  consoleSandbox,
  GLOBAL_OBJ,
  setTag,
} from '@sentry/core';
import { RELEASE_META_TAG_NAME } from '../common/utils';

const BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

// React Router inlines this context before the client entry runs, so it's there before `init`.
const GLOBAL_OBJ_WITH_ROUTER_CONTEXT = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __reactRouterContext?: { basename?: string };
};

/**
 * Initializes the client side of the React Router SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  // If BrowserTracing integration was passed to options, emit a warning
  if (options.integrations && Array.isArray(options.integrations)) {
    const hasBrowserTracing = options.integrations.some(
      integration => integration.name === BROWSER_TRACING_INTEGRATION_ID,
    );

    if (hasBrowserTracing) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          'browserTracingIntegration is not fully compatible with @sentry/react-router. Please use reactRouterTracingIntegration instead.',
        );
      });
    }
  }

  // The managed tunnel is served under the app's `basename`, like every other route. A `basePath` the user set wins.
  options.tunnel = applyBrowserTunnelDefaults(options.tunnel, {
    basePath: GLOBAL_OBJ_WITH_ROUTER_CONTEXT.__reactRouterContext?.basename,
  });

  // The Vite plugin keeps the release out of the content-hashed client chunks and has the server put it in the page.
  if (options.release === undefined) {
    const release = WINDOW.document
      ?.querySelector<HTMLMetaElement>(`meta[name="${RELEASE_META_TAG_NAME}"]`)
      ?.getAttribute('content');
    if (release) {
      options.release = release;
    }
  }

  applySdkMetadata(options, 'react-router', ['react-router', 'browser']);

  const client = browserInit(options);

  setTag('runtime', 'browser');

  return client;
}
