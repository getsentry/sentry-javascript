import { hasTracingEnabled } from '@sentry/core';
import type { BrowserOptions } from '@sentry/svelte';
import { BrowserTracing, configureScope, init as initSvelteSdk } from '@sentry/svelte';
import { addOrUpdateIntegration } from '@sentry/utils';

import { applySdkMetadata } from '../common/metadata';
import { svelteKitRoutingInstrumentation } from './router';

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

  initSvelteSdk(options);

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
