/* eslint-disable import/export */
import type { Context, TextMapGetter } from '@opentelemetry/api';
import { context, propagation, trace } from '@opentelemetry/api';
import type { CloudflareOptions } from '@sentry/cloudflare';
import { withSentry as withSentryCloudflare } from '@sentry/cloudflare';
import type { Integration } from '@sentry/core';
import {
  applySdkMetadata,
  extractTraceparentData,
  getAsyncContextStrategy,
  getMainCarrier,
  getRootSpan,
  GLOBAL_OBJ,
  spanToJSON,
} from '@sentry/core';
import {
  registerPrepareSpanScope,
  SentryPropagator,
  setOpenTelemetryContextAsyncContextStrategy,
} from '@sentry/opentelemetry';
import { ATTR_NEXT_SPAN_TYPE } from '../common/nextSpanAttributes';
import { isTunnelRouteSpan } from '../common/utils/dropMiddlewareTunnelRequests';
import { dropReactControlFlowErrorsEventProcessor } from '../common/utils/dropReactControlFlowErrors';
import { addNextjsServerSpanHooks, NEXTJS_SERVER_IGNORE_SPANS } from '../server/handleOnSpanStart';
import { nextjsUseCacheIntegration } from '../server/useCacheInstrumentation';

export * from '@sentry/cloudflare';

class NextjsCloudflarePropagator extends SentryPropagator {
  /** @inheritDoc */
  public extract(ctx: Context, carrier: unknown, getter: TextMapGetter): Context {
    // Next.js extracts the request headers again from the root context when it misses its router server context, e.g.
    // on Workers where `process.cwd()` is `/bundle`. When the root span of `withSentry` already continued that trace,
    // this would start the Next.js request span as a second segment under the upstream span.
    const activeSpan = trace.getSpan(context.active());
    const sentryTrace = getter.get(carrier, 'sentry-trace');
    const incoming = extractTraceparentData(Array.isArray(sentryTrace) ? sentryTrace[0] : sentryTrace);
    if (
      activeSpan &&
      incoming?.parentSpanId &&
      incoming.parentSpanId === spanToJSON(getRootSpan(activeSpan)).parent_span_id
    ) {
      return ctx;
    }
    return super.extract(ctx, carrier, getter);
  }
}

const nextjsIntegration = (): Integration => ({
  name: 'Nextjs',
  setup: client => {
    if ((client.getOptions() as CloudflareOptions).enableOpenTelemetrySetup) {
      propagation.setGlobalPropagator(new NextjsCloudflarePropagator());
    }
    client.getOptions().release ??= (GLOBAL_OBJ as { _sentryRelease?: string })._sentryRelease;
    addNextjsServerSpanHooks(client);
    client.addEventProcessor(dropReactControlFlowErrorsEventProcessor);
    registerPrepareSpanScope(client);
    // `dropMiddlewareTunnelRequests` only marks spans of Next.js, which are children of the root span of `withSentry`.
    client.on('beforeSampling', samplingData => {
      if (isTunnelRouteSpan(samplingData.spanAttributes)) {
        samplingData.parentSampled = false;
      }
    });
  },
});

/**
 * `withSentry` of `@sentry/cloudflare` for the Worker entry of a Next.js app, e.g. `.open-next/worker.js`. It adds the
 * span handling of `@sentry/nextjs` and the OpenTelemetry context of Next.js. Call it at module scope of the Worker entry.
 */
export const withSentry: typeof withSentryCloudflare = (optionsCallback, handler) => {
  setOpenTelemetryContextAsyncContextStrategy();
  (getAsyncContextStrategy(getMainCarrier()) as { _sentryNextjsCloudflare?: boolean })._sentryNextjsCloudflare = true;

  return withSentryCloudflare(env => {
    const options: CloudflareOptions = { enableOpenTelemetrySetup: true, ...optionsCallback(env) };
    options.ignoreSpans = [
      ...(options.ignoreSpans || []),
      ...NEXTJS_SERVER_IGNORE_SPANS,
      // The request spans of Next.js repeat the request span of `withSentry`. An ignored span does not become active,
      // so the other Next.js spans become children of the request span of `withSentry`, which then gets the route
      // from their `next.route` and its status from the response.
      { attributes: { [ATTR_NEXT_SPAN_TYPE]: 'BaseServer.handleRequest' } },
    ];
    const { tracesSampler } = options;
    if (tracesSampler) {
      // A `tracesSampler` can ignore the `parentSampled: false` that the Next.js integration sets for tunnel requests.
      options.tracesSampler = samplingContext =>
        !isTunnelRouteSpan(samplingContext.attributes || {}) && tracesSampler(samplingContext);
    }
    const userIntegrations = options.integrations;
    // A function, so the integrations are only created with a new client and not on every request.
    options.integrations = defaults => {
      const integrations = [...defaults, nextjsIntegration(), nextjsUseCacheIntegration()];
      return typeof userIntegrations === 'function'
        ? userIntegrations(integrations)
        : [...integrations, ...(userIntegrations || [])];
    };
    applySdkMetadata(options, 'nextjs', ['nextjs', 'cloudflare']);
    return options as ReturnType<typeof optionsCallback>;
  }, handler);
};
