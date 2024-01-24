import { applySdkMetadata, hasTracingEnabled } from '@sentry/core';
import type { BrowserOptions } from '@sentry/svelte';
import { getDefaultIntegrations as getDefaultSvelteIntegrations } from '@sentry/svelte';
import { WINDOW, getCurrentScope, init as initSvelteSdk } from '@sentry/svelte';
import type { Integration } from '@sentry/types';

import { BrowserTracing, browserTracingIntegration } from './browserTracingIntegration';

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
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'sveltekit', ['sveltekit', 'svelte']);

  fixBrowserTracingIntegration(opts);

  // 1. Switch window.fetch to our fetch proxy we injected earlier
  const actualFetch = switchToFetchProxy();

  // 2. Initialize the SDK which will instrument our proxy
  initSvelteSdk(opts);

  // 3. Restore the original fetch now that our proxy is instrumented
  if (actualFetch) {
    restoreFetch(actualFetch);
  }

  getCurrentScope().setTag('runtime', 'browser');
}

// TODO v8: Remove this again
// We need to handle BrowserTracing passed to `integrations` that comes from `@sentry/tracing`, not `@sentry/sveltekit` :(
function fixBrowserTracingIntegration(options: BrowserOptions): void {
  const { integrations } = options;
  if (!integrations) {
    return;
  }

  if (Array.isArray(integrations)) {
    options.integrations = maybeUpdateBrowserTracingIntegration(integrations);
  } else {
    options.integrations = defaultIntegrations => {
      const userFinalIntegrations = integrations(defaultIntegrations);

      return maybeUpdateBrowserTracingIntegration(userFinalIntegrations);
    };
  }
}

function maybeUpdateBrowserTracingIntegration(integrations: Integration[]): Integration[] {
  const browserTracing = integrations.find(integration => integration.name === 'BrowserTracing');
  // If BrowserTracing was added, but it is not our forked version,
  // replace it with our forked version with the same options
  // eslint-disable-next-line deprecation/deprecation
  if (browserTracing && !(browserTracing instanceof BrowserTracing)) {
    // eslint-disable-next-line deprecation/deprecation
    const options: ConstructorParameters<typeof BrowserTracing>[0] = (browserTracing as BrowserTracing).options;
    // This option is overwritten by the custom integration
    delete options.routingInstrumentation;
    integrations[integrations.indexOf(browserTracing)] = browserTracingIntegration(options);
  }

  return integrations;
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] | undefined {
  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false", in which case everything inside
  // will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      return [...getDefaultSvelteIntegrations(options), browserTracingIntegration()];
    }
  }

  return undefined;
}

/**
 * During server-side page load, we injected a <script> that wraps `window.fetch` so that
 * before a `fetch` call is forwarded to the original `window.fetch`, a function we control
 * is also invoked. This function is put onto the global object (`window._sentryFetchProxy`)
 * so that we can access it here.
 *
 * In this function we briefly set our fetch proxy as `window.fetch` so that the SDK can
 * instrument it.
 *
 * After initializing the SDK, `restoreFetch` must be called to put back whatever was on `window.fetch` before.
 *
 * @see ../server/handle.ts (https://github.com/getsentry/sentry-javascript/blob/8d92180c900c2ac98fd127d53703a415c1f191dd/packages/sveltekit/src/server/handle.ts#L60-L81)
 *
 * @returns the function that was previously on `window.fetch`.
 */
function switchToFetchProxy(): typeof fetch | undefined {
  const globalWithSentryFetchProxy: WindowWithSentryFetchProxy = WINDOW as WindowWithSentryFetchProxy;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const actualFetch = globalWithSentryFetchProxy.fetch;

  if (globalWithSentryFetchProxy._sentryFetchProxy && actualFetch) {
    globalWithSentryFetchProxy.fetch = globalWithSentryFetchProxy._sentryFetchProxy;
    return actualFetch;
  }
  return undefined;
}

/**
 * Restores the function @param actualFetch to `window.fetch`
 * and puts our fetch proxy back onto `window._sentryFetchProxy`.
 */
function restoreFetch(actualFetch: typeof fetch): void {
  const globalWithSentryFetchProxy: WindowWithSentryFetchProxy = WINDOW as WindowWithSentryFetchProxy;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  globalWithSentryFetchProxy._sentryFetchProxy = globalWithSentryFetchProxy.fetch;
  globalWithSentryFetchProxy.fetch = actualFetch;
}
