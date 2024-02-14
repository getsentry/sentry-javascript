import { addEventProcessor, applySdkMetadata, hasTracingEnabled, setTag } from '@sentry/core';
import type { BrowserOptions } from '@sentry/react';
import {
  DEFAULT_TRACE_PROPAGATION_TARGETS,
  getDefaultIntegrations as getReactDefaultIntegrations,
  init as reactInit,
} from '@sentry/react';
import type { EventProcessor, Integration } from '@sentry/types';

import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { browserTracingIntegration } from './browserTracingIntegration';
import { nextjsClientStackFrameNormalizationIntegration } from './clientNormalizationIntegration';
import { applyTunnelRouteOption } from './tunnelRoute';

export * from '@sentry/react';

export { captureUnderscoreErrorException } from '../common/_error';

const globalWithInjectedValues = global as typeof global & {
  __rewriteFramesAssetPrefixPath__: string;
};

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: BrowserOptions): void {
  const opts = {
    environment: getVercelEnv(true) || process.env.NODE_ENV,

    tracePropagationTargets:
      process.env.NODE_ENV === 'development'
        ? [
            // Will match any URL that contains "localhost" but not "webpack.hot-update.json" - The webpack dev-server
            // has cors and it doesn't like extra headers when it's accessed from a different URL.
            // TODO(v8): Ideally we rework our tracePropagationTargets logic so this hack won't be necessary anymore (see issue #9764)
            /^(?=.*localhost)(?!.*webpack\.hot-update\.json).*/,
            /^\/(?!\/)/,
          ]
        : [...DEFAULT_TRACE_PROPAGATION_TARGETS, /^(api\/)/],
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  } satisfies BrowserOptions;

  applyTunnelRouteOption(opts);
  applySdkMetadata(opts, 'nextjs', ['nextjs', 'react']);

  reactInit(opts);

  setTag('runtime', 'browser');
  const filterTransactions: EventProcessor = event =>
    event.type === 'transaction' && event.transaction === '/404' ? null : event;
  filterTransactions.id = 'NextClient404Filter';
  addEventProcessor(filterTransactions);

  if (process.env.NODE_ENV === 'development') {
    addEventProcessor(devErrorSymbolicationEventProcessor);
  }
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  const customDefaultIntegrations = getReactDefaultIntegrations(options);

  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false", in which case everything inside
  // will get treeshaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      customDefaultIntegrations.push(browserTracingIntegration());
    }
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
