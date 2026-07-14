import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span, SpanAttributes } from '@sentry/core';
import {
  defineIntegration,
  getActiveSpan,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_KIND,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { bindTracingChannelToSpan } from '@sentry/server-utils';
import { CODE_FUNCTION, HTTP_METHOD, HTTP_ROUTE, HTTP_STATUS_CODE, HTTP_URL } from '@sentry/conventions/attributes';
import { getClient } from '@sentry/node';
import type { RemixOptions } from '../../utils/remixOptions';

const INTEGRATION_NAME = 'Remix' as const;
const ORIGIN = 'auto.http.orchestrion.remix';

const NOOP = (): void => {};

// `match.route.id` / `match.params.*` mirror `RemixSemanticAttributes` from the vendored
// `RemixInstrumentation` this integration replaces.
const MATCH_ROUTE_ID = 'match.route.id';
const MATCH_PARAMS = 'match.params';

// The full `diagnostics_channel` names orchestrion injects for `@remix-run/server-runtime`. Source of
// truth is `remixChannels` in `@sentry/server-utils` (`orchestrion/config/remix.ts`); duplicated here
// as plain strings because that map isn't part of the package's public export surface.
const CHANNELS = {
  REQUEST_HANDLER: 'orchestrion:@remix-run/server-runtime:requestHandler',
  MATCH_SERVER_ROUTES: 'orchestrion:@remix-run/server-runtime:matchServerRoutes',
  CALL_ROUTE_LOADER: 'orchestrion:@remix-run/server-runtime:callRouteLoader',
  CALL_ROUTE_ACTION: 'orchestrion:@remix-run/server-runtime:callRouteAction',
} as const;

/**
 * The shape orchestrion's transform attaches to a tracing-channel `context` object. Documented here
 * rather than imported because orchestrion's runtime doesn't export it.
 */
interface ChannelContext {
  // The live `arguments` of the wrapped call.
  arguments: unknown[];
  result?: unknown;
  error?: unknown;
}

// `callRouteLoader`/`callRouteAction` receive a single options object as `arguments[0]`.
interface RouteCallParams {
  request?: Request;
  params?: Record<string, string | undefined>;
  routeId?: string;
}

// A pre-action clone of the request, stashed at span start so the (already consumed) body is still
// readable for form-data extraction when the action settles.
interface ActionChannelContext extends ChannelContext {
  _sentryClonedRequest?: Request;
}

// Minimal shape of a `matchServerRoutes` entry we read.
interface RouteMatch {
  route?: { path?: string; id?: string };
}

function getRequestAttributes(request: unknown): SpanAttributes {
  if (!isObjectLike(request)) {
    return {};
  }
  const { method, url } = request as Partial<Request>;
  const attributes: SpanAttributes = {};
  if (typeof method === 'string') {
    // oxlint-disable-next-line typescript/no-deprecated
    attributes[HTTP_METHOD] = method;
  }
  if (typeof url === 'string') {
    // oxlint-disable-next-line typescript/no-deprecated
    attributes[HTTP_URL] = url;
  }
  return attributes;
}

function getMatchAttributes(params: RouteCallParams): SpanAttributes {
  const attributes: SpanAttributes = {};
  if (params.routeId) {
    attributes[MATCH_ROUTE_ID] = params.routeId;
  }
  for (const [name, value] of Object.entries(params.params ?? {})) {
    attributes[`${MATCH_PARAMS}.${name}`] = value || '(undefined)';
  }
  return attributes;
}

// The route handlers return a `Response` (or, with single-fetch, a naked object without `status`).
function setResponseStatus(span: Span, result: unknown): void {
  if (!isObjectLike(result)) {
    return;
  }
  const status = (result as { status?: unknown }).status;
  if (typeof status === 'number') {
    // oxlint-disable-next-line typescript/no-deprecated
    span.setAttribute(HTTP_STATUS_CODE, status);
  }
}

/**
 * `matchServerRoutes` opens no span of its own; it enriches the enclosing request span with the
 * matched route (used to derive the `http.server` transaction name), mirroring the vendored
 * instrumentation's patch.
 */
function enrichActiveSpanWithRoute(result: unknown): void {
  const span = getActiveSpan();
  if (!span) {
    return;
  }

  const matches = Array.isArray(result) ? (result as RouteMatch[]) : [];
  const route = matches[matches.length - 1]?.route;

  if (route?.path) {
    // oxlint-disable-next-line typescript/no-deprecated
    span.setAttribute(HTTP_ROUTE, route.path);
    span.updateName(`remix.request ${route.path}`);
  }
  if (route?.id) {
    span.setAttribute(MATCH_ROUTE_ID, route.id);
  }
}

function subscribeRequestHandler(): void {
  bindTracingChannelToSpan<ChannelContext>(
    diagnosticsChannel.tracingChannel(CHANNELS.REQUEST_HANDLER),
    data =>
      startInactiveSpan({
        name: 'remix.request',
        kind: SPAN_KIND.SERVER,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
          [CODE_FUNCTION]: 'requestHandler',
          ...getRequestAttributes(data.arguments[0]),
        },
      }),
    {
      beforeSpanEnd: (span, data) => setResponseStatus(span, data.result),
    },
  );
}

function subscribeMatchServerRoutes(): void {
  // `matchServerRoutes` is synchronous, so only the `end` event carries a result; the rest are
  // no-ops. `subscribe` types demand a handler for each channel.
  diagnosticsChannel.tracingChannel<ChannelContext, ChannelContext>(CHANNELS.MATCH_SERVER_ROUTES).subscribe({
    start: NOOP,
    end(data) {
      enrichActiveSpanWithRoute(data.result);
    },
    asyncStart: NOOP,
    asyncEnd: NOOP,
    error: NOOP,
  });
}

function subscribeCallRouteLoader(): void {
  bindTracingChannelToSpan<ChannelContext>(
    diagnosticsChannel.tracingChannel(CHANNELS.CALL_ROUTE_LOADER),
    data => {
      const params = (data.arguments[0] ?? {}) as RouteCallParams;
      return startInactiveSpan({
        name: `LOADER ${params.routeId}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'loader.remix',
          [CODE_FUNCTION]: 'loader',
          ...getRequestAttributes(params.request),
          ...getMatchAttributes(params),
        },
      });
    },
    {
      requiresParentSpan: true,
      beforeSpanEnd: (span, data) => setResponseStatus(span, data.result),
    },
  );
}

function subscribeCallRouteAction(actionFormDataAttributes: Record<string, string | boolean>): void {
  bindTracingChannelToSpan<ActionChannelContext>(
    diagnosticsChannel.tracingChannel(CHANNELS.CALL_ROUTE_ACTION),
    data => {
      const params = (data.arguments[0] ?? {}) as RouteCallParams;
      // Clone the request before the action consumes its body, so the form data is still readable
      // when the span ends.
      data._sentryClonedRequest = params.request?.clone();
      return startInactiveSpan({
        name: `ACTION ${params.routeId}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'action.remix',
          [CODE_FUNCTION]: 'action',
          ...getRequestAttributes(params.request),
          ...getMatchAttributes(params),
        },
      });
    },
    {
      requiresParentSpan: true,
      // Reading form data is async, so take ownership of when the span ends: apply the response
      // status, await the form-data attributes, then end.
      deferSpanEnd: ({ span, data, end }) => {
        if ('error' in data) {
          end(data.error);
          return true;
        }

        setResponseStatus(span, data.result);

        const clonedRequest = data._sentryClonedRequest;
        if (!clonedRequest) {
          end();
          return true;
        }

        clonedRequest
          .formData()
          .then(formData => applyFormDataAttributes(span, formData, actionFormDataAttributes))
          // Silently continue on any error. Typically happens because the action body cannot be
          // processed into FormData, in which case we should just continue.
          .catch(() => undefined)
          .finally(() => end());

        return true;
      },
    },
  );
}

function applyFormDataAttributes(
  span: Span,
  formData: FormData,
  actionFormDataAttributes: Record<string, string | boolean>,
): void {
  formData.forEach((value, key) => {
    const mapped = actionFormDataAttributes[key];
    if (mapped && typeof value === 'string') {
      const keyName = mapped === true ? key : mapped;
      span.setAttribute(`formData.${keyName}`, value);
    }
  });
}

function instrumentRemix(actionFormDataAttributes: Record<string, string | boolean> | undefined): void {
  subscribeRequestHandler();
  subscribeMatchServerRoutes();
  subscribeCallRouteLoader();
  if (actionFormDataAttributes) {
    subscribeCallRouteAction(actionFormDataAttributes);
  }
}

const _remixChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19, so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      const client = getClient();
      const options = client?.getOptions() as RemixOptions | undefined;
      const actionFormDataAttributes = client?.getDataCollectionOptions().httpBodies.includes('incomingRequest')
        ? options?.captureActionFormDataKeys
        : undefined;

      waitForTracingChannelBinding(() => {
        instrumentRemix(actionFormDataAttributes);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Orchestrion-driven Remix integration.
 *
 * Ports the vendored `RemixInstrumentation` (an OTel `InstrumentationBase`) to diagnostics-channel
 * listeners, with orchestrion injecting the channels into `@remix-run/server-runtime`. Creates the
 * `remix.request` server span plus `LOADER`/`ACTION` spans, and enriches the request span with the
 * matched route. Requires the orchestrion runtime hook or bundler plugin to be active.
 */
export const remixChannelIntegration = defineIntegration(_remixChannelIntegration);
