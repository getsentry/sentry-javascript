import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  applySdkMetadata,
  getClient,
  getGlobalScope,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import { getDefaultIntegrations, init as nodeInit } from '@sentry/node';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
  ATTR_URL_QUERY,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_TARGET,
} from '@opentelemetry/semantic-conventions';
import type { EventProcessor } from '@sentry/types';
import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { isBuild } from '../common/utils/isBuild';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';

export * from '@sentry/node';

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
export function init(options: NodeOptions): NodeClient | undefined {
  if (isBuild()) {
    return;
  }

  const customDefaultIntegrations = getDefaultIntegrations(options);

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
  client?.on('beforeSampling', ({ spanAttributes, spanName, parentSampled, parentContext }, samplingDecision) => {
    // We allowlist the "BaseServer.handleRequest" span, since that one is responsible for App Router requests, which are actually useful for us.
    // HOWEVER, that span is not only responsible for App Router requests, which is why we additionally filter for certain transactions in an
    // event processor further below.
    if (spanAttributes['next.span_type'] === 'BaseServer.handleRequest') {
      return;
    }

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
    if (spanAttributes?.['next.route']) {
      const rootSpan = getRootSpan(span);
      const rootSpanAttributes = spanToJSON(rootSpan).data;

      // Only hoist the http.route attribute if the transaction doesn't already have it
      if (
        // eslint-disable-next-line deprecation/deprecation
        (rootSpanAttributes?.[ATTR_HTTP_REQUEST_METHOD] || rootSpanAttributes?.[SEMATTRS_HTTP_METHOD]) &&
        !rootSpanAttributes?.[ATTR_HTTP_ROUTE]
      ) {
        rootSpan.setAttribute(ATTR_HTTP_ROUTE, spanAttributes['next.route']);
      }
    }

    // We want to skip span data inference for any spans generated by Next.js. Reason being that Next.js emits spans
    // with patterns (e.g. http.server spans) that will produce confusing data.
    if (spanAttributes?.['next.span_type'] !== undefined) {
      span.setAttribute('sentry.skip_span_data_inference', true);
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto');
    }

    // We want to rename these spans because they look like "GET /path/to/route" and we already emit spans that look
    // like this with our own http instrumentation.
    if (spanAttributes?.['next.span_type'] === 'BaseServer.handleRequest') {
      span.updateName('next server handler'); // This is all lowercase because the spans that Next.js emits by itself generally look like this.
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

          // We only want to use our HTTP integration/instrumentation for app router requests, which are marked with the `sentry.rsc` attribute.
          if (
            (event.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] === 'auto.http.otel.http' ||
              event.contexts?.trace?.data?.['next.span_type'] === 'BaseServer.handleRequest') &&
            event.contexts?.trace?.data?.['sentry.rsc'] !== true
          ) {
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

  getGlobalScope().addEventProcessor(
    Object.assign(
      (event => {
        // Sometimes, the HTTP integration will not work, causing us not to properly set an op for spans generated by
        // Next.js that are actually more or less correct server HTTP spans, so we are backfilling the op here.
        if (
          event.type === 'transaction' &&
          event.transaction?.match(/^(RSC )?GET /) &&
          event.contexts?.trace?.data?.['sentry.rsc'] === true &&
          !event.contexts.trace.op
        ) {
          event.contexts.trace.data = event.contexts.trace.data || {};
          event.contexts.trace.data[SEMANTIC_ATTRIBUTE_SENTRY_OP] = 'http.server';
          event.contexts.trace.op = 'http.server';
        }

        return event;
      }) satisfies EventProcessor,
      { id: 'NextjsTransactionEnhancer' },
    ),
  );

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

export { wrapApiHandlerWithSentry } from '../common/wrapApiHandlerWithSentry';
