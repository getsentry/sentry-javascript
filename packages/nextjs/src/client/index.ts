import { addEventProcessor, applySdkMetadata } from '@sentry/core';
import type { BrowserOptions } from '@sentry/react';
import { getDefaultIntegrations as getReactDefaultIntegrations, init as reactInit } from '@sentry/react';
import type { Client, EventProcessor, Integration } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { browserTracingIntegration } from './browserTracingIntegration';
import { nextjsClientStackFrameNormalizationIntegration } from './clientNormalizationIntegration';
import { INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME } from './routing/appRouterRoutingInstrumentation';
import { applyTunnelRouteOption } from './tunnelRoute';

export * from '@sentry/react';

export { captureUnderscoreErrorException } from '../common/pages-router-instrumentation/_error';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __rewriteFramesAssetPrefixPath__: string;
};

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    environment: getVercelEnv(true) || process.env.NODE_ENV,
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  } satisfies BrowserOptions;

  applyTunnelRouteOption(opts);
  applySdkMetadata(opts, 'nextjs', ['nextjs', 'react']);

  const client = reactInit(opts);

  const filterTransactions: EventProcessor = event =>
    event.type === 'transaction' && event.transaction === '/404' ? null : event;
  filterTransactions.id = 'NextClient404Filter';
  addEventProcessor(filterTransactions);

  const filterIncompleteNavigationTransactions: EventProcessor = event =>
    event.type === 'transaction' && event.transaction === INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME
      ? null
      : event;
  filterIncompleteNavigationTransactions.id = 'IncompleteTransactionFilter';
  addEventProcessor(filterIncompleteNavigationTransactions);

  if (process.env.NODE_ENV === 'development') {
    addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  return client;
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  const customDefaultIntegrations = getReactDefaultIntegrations(options);
  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    customDefaultIntegrations.push(browserTracingIntegration());
  }

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const assetPrefixPath = globalWithInjectedValues.__rewriteFramesAssetPrefixPath__ || '';
  customDefaultIntegrations.push(nextjsClientStackFrameNormalizationIntegration({ assetPrefixPath }));

  return customDefaultIntegrations;
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}

export { browserTracingIntegration } from './browserTracingIntegration';

export * from '../common';
