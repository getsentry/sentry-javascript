import { applySdkMetadata, hasTracingEnabled } from '@sentry/core';
import type { BrowserOptions } from '@sentry/react';
import {
  Integrations as OriginalIntegrations,
  getCurrentScope,
  getDefaultIntegrations as getReactDefaultIntegrations,
  init as reactInit,
} from '@sentry/react';
import type { EventProcessor, Integration } from '@sentry/types';

import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { BrowserTracing, browserTracingIntegration } from './browserTracingIntegration';
import { rewriteFramesIntegration } from './rewriteFramesIntegration';
import { applyTunnelRouteOption } from './tunnelRoute';

export * from '@sentry/react';
export { nextRouterInstrumentation } from './routing/nextRoutingInstrumentation';
export { captureUnderscoreErrorException } from '../common/_error';

/** @deprecated Import the integration function directly, e.g. `inboundFiltersIntegration()` instead of `new Integrations.InboundFilter(). */
export const Integrations = {
  // eslint-disable-next-line deprecation/deprecation
  ...OriginalIntegrations,
  BrowserTracing,
};

// Previously we expected users to import `BrowserTracing` like this:
//
// import { Integrations } from '@sentry/nextjs';
// const instance = new Integrations.BrowserTracing();
//
// This makes the integrations unable to be treeshaken though. To address this, we now have
// this individual export. We now expect users to consume BrowserTracing like so:
//
// import { BrowserTracing } from '@sentry/nextjs';
// const instance = new BrowserTracing();
export {
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracing,
  browserTracingIntegration,
  rewriteFramesIntegration,
};

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: BrowserOptions): void {
  const opts = {
    environment: getVercelEnv(true) || process.env.NODE_ENV,
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  fixBrowserTracingIntegration(opts);

  applyTunnelRouteOption(opts);
  applySdkMetadata(opts, 'nextjs', ['nextjs', 'react']);

  reactInit(opts);

  const scope = getCurrentScope();
  scope.setTag('runtime', 'browser');
  const filterTransactions: EventProcessor = event =>
    event.type === 'transaction' && event.transaction === '/404' ? null : event;
  filterTransactions.id = 'NextClient404Filter';
  scope.addEventProcessor(filterTransactions);

  if (process.env.NODE_ENV === 'development') {
    scope.addEventProcessor(devErrorSymbolicationEventProcessor);
  }
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
    // These two options are overwritten by the custom integration
    delete options.routingInstrumentation;
    // eslint-disable-next-line deprecation/deprecation
    delete options.tracingOrigins;
    integrations[integrations.indexOf(browserTracing)] = browserTracingIntegration(options);
  }

  return integrations;
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  const customDefaultIntegrations = [...getReactDefaultIntegrations(options), rewriteFramesIntegration()];

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false", in which case everything inside
  // will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      customDefaultIntegrations.push(browserTracingIntegration());
    }
  }

  return customDefaultIntegrations;
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}

export * from '../common';
