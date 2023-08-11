import { hasTracingEnabled } from '@sentry/core';
import type { BrowserOptions } from '@sentry/svelte';
import { BrowserTracing, configureScope, init as initSvelteSdk, WINDOW } from '@sentry/svelte';
import type { InternalGlobal } from '@sentry/utils';
import { addOrUpdateIntegration } from '@sentry/utils';

import { applySdkMetadata } from '../common/metadata';
import { svelteKitRoutingInstrumentation } from './router';

type WindowWithSentryFetchProxy = typeof WINDOW & {
  _sentryFetchProxy?: typeof fetch;
};

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 * Initialize the client side of the Sentry SvelteKit SDK.
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: BrowserOptions): void {
  applySdkMetadata(options, ['sveltekit', 'svelte']);

  addClientIntegrations(options);

  const globalWithSentryFetchProxy: WindowWithSentryFetchProxy = WINDOW as WindowWithSentryFetchProxy;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const currentFetch = globalWithSentryFetchProxy.fetch;

  // @ts-expect-error TS thinks window.fetch is always defined but let's just make sure it really is
  if (globalWithSentryFetchProxy._sentryFetchProxy && currentFetch) {
    globalWithSentryFetchProxy.fetch = globalWithSentryFetchProxy._sentryFetchProxy;
  }

  initSvelteSdk(options);

  // eslint-disable-next-line @typescript-eslint/unbound-method
  globalWithSentryFetchProxy._sentryFetchProxy = globalWithSentryFetchProxy.fetch;
  globalWithSentryFetchProxy.fetch = currentFetch;

  configureScope(scope => {
    scope.setTag('runtime', 'browser');
  });
}

function addClientIntegrations(options: BrowserOptions): void {
  let integrations = options.integrations || [];

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      const defaultBrowserTracingIntegration = new BrowserTracing({
        routingInstrumentation: svelteKitRoutingInstrumentation,
      });

      integrations = addOrUpdateIntegration(defaultBrowserTracingIntegration, integrations, {
        'options.routingInstrumentation': svelteKitRoutingInstrumentation,
      });
    }
  }

  options.integrations = integrations;
}
