// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import type { Client, EventProcessor, Integration } from '@sentry/core';
import { addEventProcessor, applySdkMetadata, consoleSandbox, getGlobalScope, GLOBAL_OBJ } from '@sentry/core';
import type { BrowserOptions } from '@sentry/react';
import { getDefaultIntegrations as getReactDefaultIntegrations, init as reactInit } from '@sentry/react';
import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { isRedirectNavigationError } from '../common/nextNavigationErrorUtils';
import { browserTracingIntegration } from './browserTracingIntegration';
import { nextjsClientStackFrameNormalizationIntegration } from './clientNormalizationIntegration';
import { INCOMPLETE_APP_ROUTER_INSTRUMENTATION_TRANSACTION_NAME } from './routing/appRouterRoutingInstrumentation';
import { removeIsrSsgTraceMetaTags } from './routing/isrRoutingTracing';
import { applyTunnelRouteOption } from './tunnelRoute';

export * from '@sentry/react';
export * from '../common';
export { captureUnderscoreErrorException } from '../common/pages-router-instrumentation/_error';

// Override core span methods with Next.js-specific implementations that support Cache Components
export { startSpan, startSpanManual, startInactiveSpan } from '../common/utils/nextSpan';
export { browserTracingIntegration } from './browserTracingIntegration';
export { captureRouterTransitionStart } from './routing/appRouterRoutingInstrumentation';

let clientIsInitialized = false;

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewriteFramesAssetPrefixPath: string;
  _sentryAssetPrefix?: string;
  _sentryBasePath?: string;
  _sentryRelease?: string;
  _experimentalThirdPartyOriginStackFrames?: string;
};

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/** Inits the Sentry NextJS SDK on the browser with the React SDK. */
export function init(options: BrowserOptions): Client | undefined {
  if (clientIsInitialized) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nextjs] You are calling `Sentry.init()` more than once on the client. This can happen if you have both a `sentry.client.config.ts` and a `instrumentation-client.ts` file with `Sentry.init()` calls. It is recommended to call `Sentry.init()` once in `instrumentation-client.ts`.',
      );
    });
  }
  clientIsInitialized = true;

  if (!DEBUG_BUILD && options.debug) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nextjs] You have enabled `debug: true`, but Sentry debug logging was removed from your bundle (likely via `withSentryConfig({ disableLogger: true })` / `webpack.treeshake.removeDebugLogging: true`). Set that option to `false` to see Sentry debug output.',
      );
    });
  }

  // Remove cached trace meta tags for ISR/SSG pages before initializing
  // This prevents the browser tracing integration from using stale trace IDs
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    removeIsrSsgTraceMetaTags();
  }

  const opts = {
    environment: getVercelEnv(true) || process.env.NODE_ENV,
    defaultIntegrations: getDefaultIntegrations(options),
    release: process.env._sentryRelease || globalWithInjectedValues._sentryRelease,
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

  const filterNextRedirectError: EventProcessor = (event, hint) =>
    isRedirectNavigationError(hint?.originalException) || event.exception?.values?.[0]?.value === 'NEXT_REDIRECT'
      ? null
      : event;
  filterNextRedirectError.id = 'NextRedirectErrorFilter';
  addEventProcessor(filterNextRedirectError);

  if (process.env.NODE_ENV === 'development') {
    addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  try {
    // @ts-expect-error `process.turbopack` is a magic string that will be replaced by Next.js
    if (process.turbopack) {
      getGlobalScope().setTag('turbopack', true);
    }
  } catch {
    // Noop
    // The statement above can throw because process is not defined on the client
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

  // These values are injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const rewriteFramesAssetPrefixPath =
    process.env._sentryRewriteFramesAssetPrefixPath ||
    globalWithInjectedValues._sentryRewriteFramesAssetPrefixPath ||
    '';
  const assetPrefix = process.env._sentryAssetPrefix || globalWithInjectedValues._sentryAssetPrefix;
  const basePath = process.env._sentryBasePath || globalWithInjectedValues._sentryBasePath;
  const experimentalThirdPartyOriginStackFrames =
    process.env._experimentalThirdPartyOriginStackFrames === 'true' ||
    globalWithInjectedValues._experimentalThirdPartyOriginStackFrames === 'true';
  customDefaultIntegrations.push(
    nextjsClientStackFrameNormalizationIntegration({
      assetPrefix,
      basePath,
      rewriteFramesAssetPrefixPath,
      experimentalThirdPartyOriginStackFrames,
    }),
  );

  return customDefaultIntegrations;
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}
