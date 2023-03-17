import { defaultRequestInstrumentationOptions } from '@sentry-internal/tracing';
import { hasTracingEnabled } from '@sentry/core';
import type { BrowserOptions } from '@sentry/svelte';
import { BrowserTracing, configureScope, init as initSvelteSdk } from '@sentry/svelte';
import { addOrUpdateIntegration } from '@sentry/utils';

import { applySdkMetadata } from '../common/metadata';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/**
 *
 * @param options
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

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false", in which case everything inside
  // will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      const defaultBrowserTracingIntegration = new BrowserTracing({
        tracePropagationTargets: [...defaultRequestInstrumentationOptions.tracePropagationTargets, /^(api\/)/],
        // TODO: Add SvelteKit router instrumentations
        // routingInstrumentation: sveltekitRoutingInstrumentation,
      });

      integrations = addOrUpdateIntegration(defaultBrowserTracingIntegration, integrations, {
        // TODO: Add SvelteKit router instrumentations
        // options.routingInstrumentation: sveltekitRoutingInstrumentation,
      });
    }
  }

  options.integrations = integrations;
}
