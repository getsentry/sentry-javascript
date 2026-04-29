// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import { ATTR_URL_QUERY, SEMATTRS_HTTP_TARGET } from '@opentelemetry/semantic-conventions';
import type { EventProcessor } from '@sentry/core';
import {
  applySdkMetadata,
  debug,
  getClient,
  getGlobalScope,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
} from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrations, httpIntegration, init as nodeInit } from '@sentry/node';
import { DEBUG_BUILD } from '../common/debug-build';
import { devErrorSymbolicationEventProcessor } from '../common/devErrorSymbolicationEventProcessor';
import { getVercelEnv } from '../common/getVercelEnv';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../common/span-attributes-with-logic-attached';
import { isBuild } from '../common/utils/isBuild';
import { isCloudflareWaitUntilAvailable } from '../common/utils/responseEnd';
import { setUrlProcessingMetadata } from '../common/utils/setUrlProcessingMetadata';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';
import { enhanceHandleRequestRootSpan } from './enhanceHandleRequestRootSpan';
import { handleOnSpanStart } from './handleOnSpanStart';
import { prepareSafeIdGeneratorContext } from './prepareSafeIdGeneratorContext';
import { maybeCompleteCronCheckIn } from './vercelCronsMonitoring';
import { maybeCleanupQueueSpan } from './vercelQueuesMonitoring';

export * from '@sentry/node';

export { captureUnderscoreErrorException } from '../common/pages-router-instrumentation/_error';

// Override core span methods with Next.js-specific implementations that support Cache Components
export { startSpan, startSpanManual, startInactiveSpan } from '../common/utils/nextSpan';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewriteFramesDistDir?: string;
  _sentryRelease?: string;
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

/**
 * Returns the runtime configuration for the SDK based on the environment.
 * When running on OpenNext/Cloudflare, returns cloudflare runtime config.
 */
function getCloudflareRuntimeConfig(): { runtime: { name: string } } | undefined {
  if (isCloudflareWaitUntilAvailable()) {
    // todo: add version information?
    return { runtime: { name: 'cloudflare' } };
  }
  return undefined;
}

/** Inits the Sentry NextJS SDK on node. */
// eslint-disable-next-line complexity
export function init(options: NodeOptions): NodeClient | undefined {
  prepareSafeIdGeneratorContext();
  if (isBuild()) {
    return;
  }

  if (!DEBUG_BUILD && options.debug) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] You have enabled `debug: true`, but Sentry debug logging was removed from your bundle (likely via `withSentryConfig({ disableLogger: true })` / `webpack.treeshake.removeDebugLogging: true`). Set that option to `false` to see Sentry debug output.',
    );
  }

  const customDefaultIntegrations = getDefaultIntegrations(options)
    .filter(integration => integration.name !== 'Http')
    .concat(
      // We are using the HTTP integration without instrumenting incoming HTTP requests because Next.js does that by itself.
      httpIntegration({
        disableIncomingRequestSpans: true,
      }),
    );

  // Turn off Next.js' own fetch instrumentation (only when we manage OTEL)
  // https://github.com/lforst/nextjs-fork/blob/1994fd186defda77ad971c36dc3163db263c993f/packages/next/src/server/lib/patch-fetch.ts#L245
  // Enable with custom OTel setup: https://github.com/getsentry/sentry-javascript/issues/17581
  if (!options.skipOpenTelemetrySetup) {
    process.env.NEXT_OTEL_FETCH_DISABLED = '1';
  }

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = process.env._sentryRewriteFramesDistDir || globalWithInjectedValues._sentryRewriteFramesDistDir;
  if (distDirName) {
    customDefaultIntegrations.push(distDirRewriteFramesIntegration({ distDirName }));
  }

  // Detect if running on OpenNext/Cloudflare and get runtime config
  const cloudflareConfig = getCloudflareRuntimeConfig();

  const opts: NodeOptions = {
    environment: options.environment || process.env.SENTRY_ENVIRONMENT || getVercelEnv(false) || process.env.NODE_ENV,
    release: process.env._sentryRelease || globalWithInjectedValues._sentryRelease,
    defaultIntegrations: customDefaultIntegrations,
    ...options,
    // Override runtime to 'cloudflare' when running on OpenNext/Cloudflare
    ...cloudflareConfig,
  };

  const nextjsIgnoreSpans: NonNullable<NodeOptions['ignoreSpans']> = [
    // Static assets (matches `_next/static` anywhere in the name to handle custom basePath)
    /^GET (\/.*)?\/_next\/static\//,
    // Dev source-map fetch endpoints
    /\/__nextjs_original-stack-frame/,
    // Pages router /404
    /^\/404$/,
    // App router /404 and /_not-found segments (any HTTP method)
    /^(GET|HEAD|POST|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH) \/(404|_not-found)$/,
    // Next.js 13 root transactions named "NextServer.getRequestHandler" containing useless tracing
    /^NextServer\.getRequestHandler$/,
    // Spans flagged via TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION
    // (set in `dropMiddlewareTunnelRequests` during `spanStart`)
    { attributes: { [TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION]: true } },
  ];
  opts.ignoreSpans = [...(opts.ignoreSpans || []), ...nextjsIgnoreSpans];

  if (DEBUG_BUILD && opts.debug) {
    debug.enable();
  }

  DEBUG_BUILD && debug.log('Initializing SDK...');

  if (sdkAlreadyInitialized()) {
    DEBUG_BUILD && debug.log('SDK already initialized');
    return;
  }

  // Use appropriate SDK metadata based on the runtime environment
  applySdkMetadata(opts, 'nextjs', ['nextjs', cloudflareConfig ? 'cloudflare' : 'node']);

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

  client?.on('spanStart', handleOnSpanStart);
  client?.on('spanEnd', maybeCompleteCronCheckIn);
  client?.on('spanEnd', maybeCleanupQueueSpan);

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
  // This handles the legacy (non-streamed) path where the segment span is emitted as a transaction event;
  // `enhanceHandleRequestRootSpan` is adapted to operate on the event's trace context, which is the segment span's data.
  // Span streaming bypasses event processors entirely - see the `processSegmentSpan` hook below for that path.
  client?.on('preprocessEvent', event => {
    if (event.type === 'transaction' && event.contexts?.trace?.data) {
      enhanceHandleRequestRootSpan({
        attributes: event.contexts.trace.data,
        getName: () => event.transaction,
        setName: name => {
          event.transaction = name;
        },
        setOp: op => {
          event.contexts!.trace!.op = op;
        },
      });
    }

    setUrlProcessingMetadata(event);
  });

  // Streamed-span counterpart of the `preprocessEvent` hook above. Streamed segment spans never become
  // transaction events, so the same enhancement has to be applied here directly on the span JSON.
  client?.on('processSegmentSpan', span => {
    const attributes = (span.attributes ??= {});
    enhanceHandleRequestRootSpan({
      attributes,
      getName: () => span.name,
      setName: name => {
        span.name = name;
      },
      // For streamed spans, op lives in `attributes['sentry.op']` - mirror it there so middleware
      // overrides land somewhere readable (the legacy path uses a separate `event.contexts.trace.op`).
      setOp: op => {
        attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] = op;
      },
    });
  });

  if (process.env.NODE_ENV === 'development') {
    getGlobalScope().addEventProcessor(devErrorSymbolicationEventProcessor);
  }

  try {
    // @ts-expect-error `process.turbopack` is a magic string that will be replaced by Next.js
    if (process.turbopack) {
      getGlobalScope().setTag('turbopack', true);
      getGlobalScope().setAttribute('turbopack', true);
    }
  } catch {
    // Noop
    // The statement above can throw because process is not defined on the client
  }

  DEBUG_BUILD && debug.log('SDK successfully initialized');

  return client;
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

export * from '../common';

export { wrapApiHandlerWithSentry } from '../common/pages-router-instrumentation/wrapApiHandlerWithSentry';
