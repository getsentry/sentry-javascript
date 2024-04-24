import { addEventProcessor, applySdkMetadata, getClient } from '@sentry/core';
import { getDefaultIntegrations, init as nodeInit } from '@sentry/node';
import type { NodeOptions } from '@sentry/node';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { isBuild } from '../common/utils/isBuild';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';

export * from '@sentry/node';
import type { EventProcessor } from '@sentry/types';
import { httpIntegration } from './httpIntegration';

export { httpIntegration };

export { captureUnderscoreErrorException } from '../common/_error';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __rewriteFramesDistDir__?: string;
  __sentryRewritesTunnelPath__?: string;
};

// https://github.com/lforst/nextjs-fork/blob/9051bc44d969a6e0ab65a955a2fc0af522a83911/packages/next/src/server/lib/trace/constants.ts#L11
const NEXTJS_SPAN_NAME_PREFIXES = [
  'BaseServer.',
  'LoadComponents.',
  'NextServer.',
  'createServer.',
  'startServer.',
  'NextNodeServer.',
  'Render.',
  'AppRender.',
  'Router.',
  'Node.',
  'AppRouteRouteHandlers.',
  'ResolveMetadata.',
];

/**
 * A passthrough error boundary for the server that doesn't depend on any react. Error boundaries don't catch SSR errors
 * so they should simply be a passthrough.
 */
export const ErrorBoundary = (props: React.PropsWithChildren<unknown>): React.ReactNode => {
  if (!props.children) {
    return null;
  }

  if (typeof props.children === 'function') {
    return (props.children as () => React.ReactNode)();
  }

  // since Next.js >= 10 requires React ^16.6.0 we are allowed to return children like this here
  return props.children as React.ReactNode;
};

/**
 * A passthrough redux enhancer for the server that doesn't depend on anything from the `@sentry/react` package.
 */
export function createReduxEnhancer() {
  return (createStore: unknown) => createStore;
}

/**
 * A passthrough error boundary wrapper for the server that doesn't depend on any react. Error boundaries don't catch
 * SSR errors so they should simply be a passthrough.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorBoundary<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
): React.FC<P> {
  return WrappedComponent as React.FC<P>;
}

/**
 * Just a passthrough since we're on the server and showing the report dialog on the server doesn't make any sense.
 */
export function showReportDialog(): void {
  return;
}

/** Inits the Sentry NextJS SDK on node. */
export function init(options: NodeOptions): void {
  if (isBuild()) {
    return;
  }

  const customDefaultIntegrations = [
    ...getDefaultIntegrations(options).filter(
      integration =>
        // Next.js comes with its own Http instrumentation for OTel which would lead to double spans for route handler requests
        integration.name !== 'Http',
    ),
    httpIntegration(),
  ];

  // Turn off Next.js' own fetch instrumentation
  // https://github.com/lforst/nextjs-fork/blob/1994fd186defda77ad971c36dc3163db263c993f/packages/next/src/server/lib/patch-fetch.ts#L245
  process.env.NEXT_OTEL_FETCH_DISABLED = '1';

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = globalWithInjectedValues.__rewriteFramesDistDir__;
  if (distDirName) {
    customDefaultIntegrations.push(distDirRewriteFramesIntegration({ distDirName }));
  }

  const opts: NodeOptions = {
    environment: process.env.SENTRY_ENVIRONMENT || getVercelEnv(false) || process.env.NODE_ENV,
    defaultIntegrations: customDefaultIntegrations,
    ...options,
    // Right now we only capture frontend sessions for Next.js
    autoSessionTracking: false,
  };

  if (DEBUG_BUILD && opts.debug) {
    logger.enable();
  }

  DEBUG_BUILD && logger.log('Initializing SDK...');

  if (sdkAlreadyInitialized()) {
    DEBUG_BUILD && logger.log('SDK already initialized');
    return;
  }

  applySdkMetadata(opts, 'nextjs', ['nextjs', 'node']);

  nodeInit(opts);

  const client = getClient();
  client?.on('beforeSampling', ({ spanAttributes, spanName, parentSampled, parentContext }, samplingDecision) => {
    // If we encounter a span emitted by Next.js, we do not want to sample it
    // The reason for this is that the data quality of the spans varies, it is different per version of Next,
    // and we need to keep our manual instrumentation around for the edge runtime anyhow.
    // BUT we only do this if we don't have a parent span with a sampling decision yet (or if the parent is remote)
    if (
      (spanAttributes['next.span_type'] || NEXTJS_SPAN_NAME_PREFIXES.some(prefix => spanName.startsWith(prefix))) &&
      (parentSampled === undefined || parentContext?.isRemote)
    ) {
      samplingDecision.decision = false;
    }
  });

  addEventProcessor(
    Object.assign(
      (event => {
        if (event.type === 'transaction') {
          // Filter out transactions for static assets
          // This regex matches the default path to the static assets (`_next/static`) and could potentially filter out too many transactions.
          // We match `/_next/static/` anywhere in the transaction name because its location may change with the basePath setting.
          if (event.transaction?.match(/^GET (\/.*)?\/_next\/static\//)) {
            return null;
          }

          // Filter out transactions for requests to the tunnel route
          if (
            globalWithInjectedValues.__sentryRewritesTunnelPath__ &&
            event.transaction === `POST ${globalWithInjectedValues.__sentryRewritesTunnelPath__}`
          ) {
            return null;
          }

          // Filter out requests to resolve source maps for stack frames in dev mode
          if (event.transaction?.match(/\/__nextjs_original-stack-frame/)) {
            return null;
          }

          // Filter out /404 transactions for pages-router which seem to be created excessively
          if (event.transaction === '/404') {
            return null;
          }

          return event;
        } else {
          return event;
        }
      }) satisfies EventProcessor,
      { id: 'NextLowQualityTransactionsFilter' },
    ),
  );

  if (process.env.NODE_ENV === 'development') {
    addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  DEBUG_BUILD && logger.log('SDK successfully initialized');
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

export * from '../common';

export { wrapApiHandlerWithSentry } from '../common/wrapApiHandlerWithSentry';
