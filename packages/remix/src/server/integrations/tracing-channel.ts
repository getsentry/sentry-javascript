import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  getActiveSpan,
  getSpanStatusFromHttpCode,
  isObjectLike,
  isURLObjectRelative,
  parseStringToURLObject,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToStreamedSpanJSON,
  startInactiveSpan,
  waitForTracingChannelBinding,
  filterCollectedUrl,
} from '@sentry/core';
import { bindTracingChannelToSpan } from '@sentry/server-utils';
import {
  CODE_FUNCTION_NAME,
  HTTP_METHOD,
  HTTP_ROUTE,
  HTTP_STATUS_CODE,
  URL_FULL,
  URL_PATH,
  SENTRY_KIND,
  SENTRY_OP,
  HTTP_RESPONSE_STATUS_CODE,
} from '@sentry/conventions/attributes';
import { WEB_SERVER_FUNCTION_SPAN_OP } from '@sentry/conventions/op';
import { remixChannels } from '@sentry/server-utils/orchestrion';
import type { FormDataCapture } from '../../utils/formData';
import { applyFormDataAttributes } from '../../utils/formData';

const ORIGIN = 'auto.http.remix';

const NOOP = (): void => {};

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

// The in-flight form-data read, started at span start (before the action consumes the body) so it
// overlaps the action's execution rather than starting after it settles.
interface ActionChannelContext extends ChannelContext {
  _sentryFormData?: Promise<FormData>;
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
    const urlObject = parseStringToURLObject(url);
    attributes[URL_FULL] = filterCollectedUrl(
      urlObject && !isURLObjectRelative(urlObject) ? urlObject.href : undefined,
    );
    attributes[URL_PATH] = urlObject?.pathname;
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
    span.setAttribute(HTTP_RESPONSE_STATUS_CODE, status);

    const spanStatus = getSpanStatusFromHttpCode(status);
    span.setStatus(spanStatus);
  }
}

/**
 * `matchServerRoutes` opens no span of its own; it enriches the enclosing request span with the
 * matched route (used to derive the `http.server` transaction name).
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
    // oxlint-disable-next-line typescript/no-deprecated
    const method = spanToStreamedSpanJSON(span).attributes[HTTP_METHOD];
    span.updateName(typeof method === 'string' ? `${method} ${route.path}` : route.path);
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  }
  if (route?.id) {
    span.setAttribute(MATCH_ROUTE_ID, route.id);
  }
}

function subscribeRequestHandler(): void {
  bindTracingChannelToSpan<ChannelContext>(
    diagnosticsChannel.tracingChannel(remixChannels.REMIX_REQUEST_HANDLER),
    data => {
      const requestAttributes = getRequestAttributes(data.arguments[0]);
      // oxlint-disable-next-line typescript/no-deprecated
      const method = requestAttributes[HTTP_METHOD];
      const path = requestAttributes[URL_PATH];
      const hasUrlName = typeof method === 'string' && typeof path === 'string';
      return startInactiveSpan({
        name: hasUrlName ? `${method} ${path}` : 'remix.request',
        attributes: {
          [SENTRY_KIND]: 'server',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
          ...(hasUrlName && { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' }),
          [CODE_FUNCTION_NAME]: 'requestHandler',
          ...requestAttributes,
        },
      });
    },
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
          [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
          [CODE_FUNCTION_NAME]: 'loader',
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

function subscribeCallRouteAction(formDataCapture: FormDataCapture | undefined): void {
  bindTracingChannelToSpan<ActionChannelContext>(
    diagnosticsChannel.tracingChannel(remixChannels.REMIX_CALL_ROUTE_ACTION),
    data => {
      const params = (data.arguments[0] ?? {}) as RouteCallParams;
      // Start reading the form data now (from a clone taken before the action consumes the body), so
      // it overlaps the action's execution. Unlike the patched instrumentation, a channel can't
      // delay the action promise, so reading only after it settles would race the parent
      // `requestHandler` span flushing the transaction. Reading here means the promise is (virtually
      // always) already resolved by `asyncEnd`, so ending the span costs a single microtask.
      if (formDataCapture && params.request) {
        const formData = params.request.clone().formData();
        // Attach a handler so an unconsumed rejection (e.g. the action errored) isn't unhandled.
        formData.catch(() => undefined);
        data._sentryFormData = formData;
      }
      return startInactiveSpan({
        name: `ACTION ${params.routeId}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
          [CODE_FUNCTION_NAME]: 'action',
          ...getRequestAttributes(params.request),
          ...getMatchAttributes(params),
        },
      });
    },
    {
      requiresParentSpan: true,
      beforeSpanEnd: (span, data) => setResponseStatus(span, data.result),
      // Hold the span end until the (already in-flight) form-data read resolves, then apply the
      // attributes and end (which sets the response status via `beforeSpanEnd`). On error, or when
      // capture isn't configured, let the helper end the span normally.
      deferSpanEnd: ({ span, data, end }) => {
        const formData = data._sentryFormData;
        if (!formDataCapture || !formData || 'error' in data) {
          return false;
        }

        formData
          .then(resolved => applyFormDataAttributes(span, resolved, formDataCapture))
          // Silently continue on any error. Typically happens because the action body cannot be
          // processed into FormData, in which case we should just continue.
          .catch(() => undefined)
          .finally(() => end());

        return true;
      },
    },
  );
}

export function instrumentRemix(formDataCapture: FormDataCapture | undefined): void {
  // `tracingChannel` is unavailable before Node 18.19, so do nothing in that case.
  if (!diagnosticsChannel.tracingChannel) {
    return;
  }

  waitForTracingChannelBinding(() => {
    subscribeRequestHandler();
    subscribeMatchServerRoutes();
    subscribeCallRouteLoader();
    // Always instrument actions; `formDataCapture` only gates the optional form-data
    // attribute extraction, not whether ACTION spans are created.
    subscribeCallRouteAction(formDataCapture);
  });
}
