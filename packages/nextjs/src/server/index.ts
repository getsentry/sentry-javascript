import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  applySdkMetadata,
  getCapturedScopesOnSpan,
  getClient,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  setCapturedScopesOnSpan,
  spanToJSON,
} from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations, httpIntegration, init as nodeInit } from '@sentry/node';
import { GLOBAL_OBJ, extractTraceparentData, logger, stripUrlQueryAndFragment } from '@sentry/utils';

import { context } from '@opentelemetry/api';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
  ATTR_URL_QUERY,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_TARGET,
} from '@opentelemetry/semantic-conventions';
import { getScopesFromContext } from '@sentry/opentelemetry';
import type { EventProcessor } from '@sentry/types';
import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import {
  TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL,
  TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL,
  TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION,
} from '../common/span-attributes-with-logic-attached';
import { isBuild } from '../common/utils/isBuild';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';

export * from '@sentry/node';

export { captureUnderscoreErrorException } from '../common/pages-router-instrumentation/_error';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __rewriteFramesDistDir__?: string;
  __sentryRewritesTunnelPath__?: string;
};

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
export function init(options: NodeOptions): NodeClient | undefined {
  if (isBuild()) {
    return;
  }

  const customDefaultIntegrations = getDefaultIntegrations(options)
    .filter(integration => integration.name !== 'Http')
    .concat(
      // We are using the HTTP integration without instrumenting incoming HTTP requests because Next.js does that by itself.
      httpIntegration({
        disableIncomingRequestSpans: true,
      }),
    );

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

  const client = nodeInit(opts);
  client?.on('beforeSampling', ({ spanAttributes }, samplingDecision) => {
    // There are situations where the Next.js Node.js server forwards requests for the Edge Runtime server (e.g. in
    // middleware) and this causes spans for Sentry ingest requests to be created. These are not exempt from our tracing
    // because we didn't get the chance to do `suppressTracing`, since this happens outside of userland.
    // We need to drop these spans.
    if (
      // eslint-disable-next-line deprecation/deprecation
      (typeof spanAttributes[SEMATTRS_HTTP_TARGET] === 'string' &&
        // eslint-disable-next-line deprecation/deprecation
        spanAttributes[SEMATTRS_HTTP_TARGET].includes('sentry_key') &&
        // eslint-disable-next-line deprecation/deprecation
        spanAttributes[SEMATTRS_HTTP_TARGET].includes('sentry_client')) ||
      (typeof spanAttributes[ATTR_URL_QUERY] === 'string' &&
        spanAttributes[ATTR_URL_QUERY].includes('sentry_key') &&
        spanAttributes[ATTR_URL_QUERY].includes('sentry_client'))
    ) {
      samplingDecision.decision = false;
    }
  });

  client?.on('spanStart', span => {
    const spanAttributes = spanToJSON(span).data;

    // What we do in this glorious piece of code, is hoist any information about parameterized routes from spans emitted
    // by Next.js via the `next.route` attribute, up to the transaction by setting the http.route attribute.
    if (typeof spanAttributes?.['next.route'] === 'string') {
      const rootSpan = getRootSpan(span);
      const rootSpanAttributes = spanToJSON(rootSpan).data;

      // Only hoist the http.route attribute if the transaction doesn't already have it
      if (
        // eslint-disable-next-line deprecation/deprecation
        (rootSpanAttributes?.[ATTR_HTTP_REQUEST_METHOD] || rootSpanAttributes?.[SEMATTRS_HTTP_METHOD]) &&
        !rootSpanAttributes?.[ATTR_HTTP_ROUTE]
      ) {
        const route = spanAttributes['next.route'].replace(/\/route$/, '');
        rootSpan.updateName(route);
        rootSpan.setAttribute(ATTR_HTTP_ROUTE, route);
      }
    }

    // We want to skip span data inference for any spans generated by Next.js. Reason being that Next.js emits spans
    // with patterns (e.g. http.server spans) that will produce confusing data.
    if (spanAttributes?.['next.span_type'] !== undefined) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto');
    }

    // We want to fork the isolation scope for incoming requests
    if (spanAttributes?.['next.span_type'] === 'BaseServer.handleRequest' && span === getRootSpan(span)) {
      const scopes = getCapturedScopesOnSpan(span);

      const isolationScope = (scopes.isolationScope || getIsolationScope()).clone();
      const scope = scopes.scope || getCurrentScope();

      const currentScopesPointer = getScopesFromContext(context.active());
      if (currentScopesPointer) {
        currentScopesPointer.isolationScope = isolationScope;
      }

      setCapturedScopesOnSpan(span, scope, isolationScope);
    }
  });

  getGlobalScope().addEventProcessor(
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

          // Filter out /404 transactions which seem to be created excessively
          if (
            // Pages router
            event.transaction === '/404' ||
            // App router (could be "GET /404", "POST /404", ...)
            event.transaction?.match(/^(GET|HEAD|POST|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH) \/(404|_not-found)$/)
          ) {
            return null;
          }

          // Filter transactions that we explicitly want to drop.
          if (event.contexts?.trace?.data?.[TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION]) {
            return null;
          }

          // Next.js 13 sometimes names the root transactions like this containing useless tracing.
          if (event.transaction === 'NextServer.getRequestHandler') {
            return null;
          }

          // Next.js 13 is not correctly picking up tracing data for trace propagation so we use a back-fill strategy
          if (typeof event.contexts?.trace?.data?.[TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL] === 'string') {
            const traceparentData = extractTraceparentData(
              event.contexts.trace.data[TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL],
            );

            if (traceparentData?.parentSampled === false) {
              return null;
            }
          }

          return event;
        } else {
          return event;
        }
      }) satisfies EventProcessor,
      { id: 'NextLowQualityTransactionsFilter' },
    ),
  );

  getGlobalScope().addEventProcessor(
    Object.assign(
      ((event, hint) => {
        if (event.type !== undefined) {
          return event;
        }

        const originalException = hint.originalException;

        const isPostponeError =
          typeof originalException === 'object' &&
          originalException !== null &&
          '$$typeof' in originalException &&
          originalException.$$typeof === Symbol.for('react.postpone');

        if (isPostponeError) {
          // Postpone errors are used for partial-pre-rendering (PPR)
          return null;
        }

        // We don't want to capture suspense errors as they are simply used by React/Next.js for control flow
        const exceptionMessage = event.exception?.values?.[0]?.value;
        if (
          exceptionMessage?.includes('Suspense Exception: This is not a real error!') ||
          exceptionMessage?.includes('Suspense Exception: This is not a real error, and should not leak')
        ) {
          return null;
        }

        return event;
      }) satisfies EventProcessor,
      { id: 'DropReactControlFlowErrors' },
    ),
  );

  // Use the preprocessEvent hook instead of an event processor, so that the users event processors receive the most
  // up-to-date value, but also so that the logic that detects changes to the transaction names to set the source to
  // "custom", doesn't trigger.
  client?.on('preprocessEvent', event => {
    // Enhance route handler transactions
    if (
      event.type === 'transaction' &&
      event.contexts?.trace?.data?.['next.span_type'] === 'BaseServer.handleRequest'
    ) {
      event.contexts.trace.data = event.contexts.trace.data || {};
      event.contexts.trace.data[SEMANTIC_ATTRIBUTE_SENTRY_OP] = 'http.server';
      event.contexts.trace.op = 'http.server';

      if (event.transaction) {
        event.transaction = stripUrlQueryAndFragment(event.transaction);
      }

      // eslint-disable-next-line deprecation/deprecation
      const method = event.contexts.trace.data[SEMATTRS_HTTP_METHOD];
      // eslint-disable-next-line deprecation/deprecation
      const target = event.contexts?.trace?.data?.[SEMATTRS_HTTP_TARGET];
      const route = event.contexts.trace.data[ATTR_HTTP_ROUTE];

      if (typeof method === 'string' && typeof route === 'string') {
        event.transaction = `${method} ${route.replace(/\/route$/, '')}`;
        event.contexts.trace.data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] = 'route';
      }

      // backfill transaction name for pages that would otherwise contain unparameterized routes
      if (event.contexts.trace.data[TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL] && event.transaction !== 'GET /_app') {
        event.transaction = `${method} ${event.contexts.trace.data[TRANSACTION_ATTR_SENTRY_ROUTE_BACKFILL]}`;
      }

      // Next.js overrides transaction names for page loads that throw an error
      // but we want to keep the original target name
      if (event.transaction === 'GET /_error' && target) {
        event.transaction = `${method ? `${method} ` : ''}${target}`;
      }
    }

    // Next.js 13 is not correctly picking up tracing data for trace propagation so we use a back-fill strategy
    if (
      event.type === 'transaction' &&
      typeof event.contexts?.trace?.data?.[TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL] === 'string'
    ) {
      const traceparentData = extractTraceparentData(event.contexts.trace.data[TRANSACTION_ATTR_SENTRY_TRACE_BACKFILL]);

      if (traceparentData?.traceId) {
        event.contexts.trace.trace_id = traceparentData.traceId;
      }

      if (traceparentData?.parentSpanId) {
        event.contexts.trace.parent_span_id = traceparentData.parentSpanId;
      }
    }
  });

  if (process.env.NODE_ENV === 'development') {
    getGlobalScope().addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  DEBUG_BUILD && logger.log('SDK successfully initialized');

  return client;
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

export * from '../common';

export { wrapApiHandlerWithSentry } from '../common/pages-router-instrumentation/wrapApiHandlerWithSentry';
