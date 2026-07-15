import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Span, SpanAttributes } from '@sentry/core';
import {
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
import { remixChannels } from '@sentry/server-utils/orchestrion';

const ORIGIN = 'auto.http.orchestrion.remix';

const NOOP = (): void => {};

// `match.route.id` / `match.params.*` mirror `RemixSemanticAttributes` from the vendored
// `RemixInstrumentation` this integration replaces.
const MATCH_ROUTE_ID = 'match.route.id';
const MATCH_PARAMS = 'match.params';

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
    diagnosticsChannel.tracingChannel(remixChannels.REMIX_REQUEST_HANDLER),
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
  diagnosticsChannel.tracingChannel<ChannelContext, ChannelContext>(remixChannels.REMIX_MATCH_SERVER_ROUTES).subscribe({
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
    diagnosticsChannel.tracingChannel(remixChannels.REMIX_CALL_ROUTE_LOADER),
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

function subscribeCallRouteAction(actionFormDataAttributes: Record<string, string | boolean> | undefined): void {
  bindTracingChannelToSpan<ActionChannelContext>(
    diagnosticsChannel.tracingChannel(remixChannels.REMIX_CALL_ROUTE_ACTION),
    data => {
      const params = (data.arguments[0] ?? {}) as RouteCallParams;
      // Only clone the request (before the action consumes its body) when form-data capture is
      // configured, so the body is still readable when the span ends.
      if (actionFormDataAttributes) {
        data._sentryClonedRequest = params.request?.clone();
      }
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
      beforeSpanEnd: (span, data) => setResponseStatus(span, data.result),
      // When form-data capture is configured, reading it is async, so take ownership of when the
      // span ends: await the form-data attributes, then end (which applies the response status via
      // `beforeSpanEnd`). Otherwise let the helper end the span normally.
      deferSpanEnd: ({ span, data, end }) => {
        const clonedRequest = data._sentryClonedRequest;
        if (!actionFormDataAttributes || !clonedRequest || 'error' in data) {
          return false;
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

export function instrumentRemix(actionFormDataAttributes: Record<string, string | boolean> | undefined): void {
  // `tracingChannel` is unavailable before Node 18.19, so do nothing in that case.
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  waitForTracingChannelBinding(() => {
    subscribeRequestHandler();
    subscribeMatchServerRoutes();
    subscribeCallRouteLoader();
    // Always instrument actions; `actionFormDataAttributes` only gates the optional form-data
    // attribute extraction, not whether ACTION spans are created.
    subscribeCallRouteAction(actionFormDataAttributes);
  });
}
