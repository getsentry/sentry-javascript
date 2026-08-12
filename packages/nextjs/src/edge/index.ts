// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
import {
  applySdkMetadata,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  GLOBAL_OBJ,
  registerSpanErrorInstrumentation,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
} from '@sentry/core';
import type { VercelEdgeOptions } from '@sentry/vercel-edge';
import { getDefaultIntegrations, init as vercelEdgeInit } from '@sentry/vercel-edge';
import { DEBUG_BUILD } from '../common/debug-build';
import { ATTR_NEXT_SPAN_NAME, ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';
import {
  ATTR_NEXT_PAGES_API_ROUTE_TYPE,
  TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION,
} from '../common/span-attributes-with-logic-attached';
import { addHeadersAsAttributes } from '../common/utils/addHeadersAsAttributes';
import { backfillHttpResponseStatusCode } from '../common/utils/backfillHttpResponseStatusCode';
import { backfillHttpServerStatus } from '../common/utils/backfillHttpServerStatus';
import { createLiveRootSpanAdapter } from '../common/utils/liveRootSpanAdapter';
import { dropMiddlewareTunnelRequests } from '../common/utils/dropMiddlewareTunnelRequests';
import { maybeForkIsolationScopeForRootSpan } from '../common/utils/forkIsolationScopeForRootSpan';
import { getNormalizedRequestFromAttributes } from '../common/utils/getNormalizedRequestFromAttributes';
import { isBuild } from '../common/utils/isBuild';
import { flushSafelyWithTimeout, isCloudflareWaitUntilAvailable, waitUntil } from '../common/utils/responseEnd';
import { setUrlProcessingMetadata } from '../common/utils/setUrlProcessingMetadata';
import { distDirRewriteFramesIntegration } from './distDirRewriteFramesIntegration';
import { enhanceMiddlewareRootSpan } from '../common/enhanceMiddlewareRootSpan';
import { enhanceRunHandlerRootSpan } from './enhanceRunHandlerRootSpan';
import { SENTRY_KIND } from '@sentry/conventions/attributes';
import { WEB_SERVER_MIDDLEWARE_SPAN_OP } from '@sentry/conventions/op';

export * from '@sentry/vercel-edge';
export * from '../common';
export { captureUnderscoreErrorException } from '../common/pages-router-instrumentation/_error';

export { pinoIntegration } from '../common/pinoIntegrationShim';

// Override core span methods with Next.js-specific implementations that support Cache Components
export { startSpan, startSpanManual, startInactiveSpan } from '../common/utils/nextSpan';
export { wrapApiHandlerWithSentry } from './wrapApiHandlerWithSentry';

export type EdgeOptions = VercelEdgeOptions;

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRewriteFramesDistDir?: string;
  _sentryRelease?: string;
  _sentryRewritesTunnelPath?: string;
};

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: VercelEdgeOptions = {}): void {
  registerSpanErrorInstrumentation();

  if (isBuild()) {
    return;
  }

  if (!DEBUG_BUILD && options.debug) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] You have enabled `debug: true`, but Sentry debug logging was removed from your bundle (likely via `webpack.treeshake.removeDebugLogging: true`). Set that option to `false` to see Sentry debug output.',
    );
  }

  const customDefaultIntegrations = getDefaultIntegrations();

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = process.env._sentryRewriteFramesDistDir || globalWithInjectedValues._sentryRewriteFramesDistDir;

  if (distDirName) {
    customDefaultIntegrations.push(distDirRewriteFramesIntegration({ distDirName }));
  }

  // Detect if running on OpenNext/Cloudflare
  const isRunningOnCloudflare = isCloudflareWaitUntilAvailable();

  const opts: VercelEdgeOptions = {
    defaultIntegrations: customDefaultIntegrations,
    environment: options.environment || process.env.SENTRY_ENVIRONMENT,
    release: process.env._sentryRelease || globalWithInjectedValues._sentryRelease,
    ...options,
    // Override runtime to 'cloudflare' when running on OpenNext/Cloudflare
    ...(isRunningOnCloudflare && { runtime: { name: 'cloudflare' } }),
  };

  const nextjsIgnoreSpans: NonNullable<VercelEdgeOptions['ignoreSpans']> = [
    // (set in `dropMiddlewareTunnelRequests` during `spanStart`)
    { attributes: { [TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION]: true } },
  ];
  opts.ignoreSpans = [...(opts.ignoreSpans || []), ...nextjsIgnoreSpans];

  // Use appropriate SDK metadata based on the runtime environment
  if (isRunningOnCloudflare) {
    applySdkMetadata(opts, 'nextjs', ['nextjs', 'cloudflare']);
  } else {
    applySdkMetadata(opts, 'nextjs', ['nextjs', 'vercel-edge']);
  }

  const client = vercelEdgeInit(opts);

  // Next.js's OTel instrumentation samples root spans before the Sentry middleware wrapper can set
  // `normalizedRequest` on the isolation scope. Seed it from span attributes so `tracesSampler` has access.
  client.on('beforeSampling', ({ spanAttributes }) => {
    const spanType = spanAttributes[ATTR_NEXT_SPAN_TYPE];
    if (spanType !== 'Middleware.execute' && spanType !== 'BaseServer.handleRequest') {
      return;
    }

    // Clear the key before writing: `setSDKProcessingMetadata` merges into nested objects, so a partial request
    // (or none at all) would otherwise keep stale fields (e.g. `query_string`) left on the (potentially shared)
    // isolation scope by a previous request on a warm worker.
    const isolationScope = getIsolationScope();
    isolationScope.setSDKProcessingMetadata({ normalizedRequest: undefined });

    const normalizedRequest = getNormalizedRequestFromAttributes(spanAttributes);
    if (normalizedRequest) {
      isolationScope.setSDKProcessingMetadata({ normalizedRequest });
    }
  });

  client.on('spanStart', span => {
    const spanAttributes = spanToJSON(span).attributes;
    const rootSpan = getRootSpan(span);
    const isRootSpan = span === rootSpan;

    dropMiddlewareTunnelRequests(span, spanAttributes);

    // Mark all spans generated by Next.js as 'auto' & server
    if (spanAttributes?.[ATTR_NEXT_SPAN_TYPE] !== undefined) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto');
      span.setAttribute(SENTRY_KIND, 'server');
    }

    // Make sure middleware spans get the right op
    if (spanAttributes?.[ATTR_NEXT_SPAN_TYPE] === 'Middleware.execute') {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, WEB_SERVER_MIDDLEWARE_SPAN_OP);
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'url');
    }

    // Backfill op and source for pages-router API routes: we no longer create this span in the wrapper,
    // so we rely on the Next.js `Node.runHandler` span becoming the transaction.
    if (
      spanAttributes?.[ATTR_NEXT_SPAN_TYPE] === 'Node.runHandler' &&
      String(spanAttributes?.[ATTR_NEXT_SPAN_NAME]).startsWith(ATTR_NEXT_PAGES_API_ROUTE_TYPE)
    ) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.server');
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    }

    // The `BaseServer.handleRequest` span is the incoming request root span (e.g. for app-router server
    // components). Since we no longer infer the op from OTel semantic attributes, set it directly here.
    if (spanAttributes?.[ATTR_NEXT_SPAN_TYPE] === 'BaseServer.handleRequest') {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.server');
    }

    // We want to fork the isolation scope for incoming requests
    maybeForkIsolationScopeForRootSpan(span, spanAttributes);

    if (isRootSpan) {
      // todo: check if we can set request headers for edge on sdkProcessingMetadata
      const headers = getIsolationScope().getScopeData().sdkProcessingMetadata?.normalizedRequest?.headers;
      addHeadersAsAttributes(headers, rootSpan);
    }
  });

  client.on('preprocessEvent', event => {
    setUrlProcessingMetadata(event);
  });

  client.on('spanEnd', span => {
    if (span !== getRootSpan(span)) {
      return;
    }

    // Normalize name/op/source/status on the request root span at span end, before it is serialized into
    // a transaction event (legacy) or streamed span JSON, so both lifecycles pick up the changes here.
    const mutableRootSpan = createLiveRootSpanAdapter(span);
    enhanceMiddlewareRootSpan(mutableRootSpan);
    enhanceRunHandlerRootSpan(mutableRootSpan);
    backfillHttpResponseStatusCode(mutableRootSpan.attributes);
    backfillHttpServerStatus(span);

    waitUntil(flushSafelyWithTimeout());
  });

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
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}
