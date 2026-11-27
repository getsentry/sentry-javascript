import {
  CODE_FUNCTION_NAME,
  ERROR_TYPE,
  HTTP_ROUTE,
  SENTRY_DESCRIPTION,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import type { Integration, Options, Span } from '@sentry/core';
import {
  defineIntegration,
  getActiveSpan,
  getClient,
  getSpanStatusFromHttpCode,
  hasSpanStreamingEnabled,
  isObjectLike,
  isString,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startInactiveSpan,
} from '@sentry/core';
import type { TracingChannelPayloadWithSpan } from '@sentry/server-utils';
import { bindTracingChannelToSpan, diagnosticsTracingChannel } from '@sentry/server-utils';

/** Nuxt marks the channels as experimental, so every field is optional. */
interface NuxtRenderPayload {
  ssrContext?: {
    error?: boolean;
    payload?: { error?: { status?: unknown; statusCode?: unknown } };
    '~renderResponse'?: unknown;
    /** The older name of `~renderResponse`. */
    _renderResponse?: unknown;
    nuxt?: { $router?: { currentRoute?: { value?: { matched?: Array<{ path?: unknown }> } } } };
  };
}

/** What the SDK reads from the `nuxt.data` payload. */
interface NuxtDataPayload {
  key?: unknown;
  functionName?: unknown;
}

const INTEGRATION_NAME = 'NuxtTracingChannel';

function isErrorPageRender({ ssrContext }: NuxtRenderPayload): boolean {
  return ssrContext?.error === true;
}

function startRenderSpan(payload: NuxtRenderPayload): Span | undefined {
  // Without a request root span, for example with tracing off, return no span. A non-recording span would become
  // active and hide the incoming trace from errors in the render.
  if (!getActiveSpan()) {
    return undefined;
  }

  const name = isErrorPageRender(payload) ? 'renderErrorPage' : 'renderPage';

  return startInactiveSpan({
    name,
    attributes: {
      [SENTRY_OP]: FUNCTION,
      [SENTRY_ORIGIN]: 'auto.function.nuxt.render',
      [CODE_FUNCTION_NAME]: name,
    },
  });
}

function getMatchedRoute({ ssrContext }: NuxtRenderPayload): string | undefined {
  const matched = ssrContext?.nuxt?.$router?.currentRoute?.value?.matched;
  const path = matched?.[matched.length - 1]?.path;
  return typeof path === 'string' ? path : undefined;
}

/** After a redirect in a route middleware or a plugin, Nuxt rejects the render and catches the error itself. */
function isSkippedRender(data: TracingChannelPayloadWithSpan<NuxtRenderPayload>): boolean {
  return 'error' in data && !!(data.ssrContext?.['~renderResponse'] ?? data.ssrContext?._renderResponse);
}

/**
 * A component error does not reject the render. Nuxt keeps the error in the payload and throws it after the render.
 * A 3xx or 4xx error is not a failure, as in `sentryCaptureErrorHook`.
 */
function isFailedPageRender(payload: NuxtRenderPayload): boolean {
  const error = payload.ssrContext?.payload?.error;
  if (!error || isErrorPageRender(payload)) {
    return false;
  }

  const statusCode = Number(error.status ?? error.statusCode);
  return !(statusCode >= 300 && statusCode < 500);
}

function setRenderResult(span: Span, data: TracingChannelPayloadWithSpan<NuxtRenderPayload>): void {
  if (isSkippedRender(data)) {
    // Undo the error state from `bindTracingChannelToSpan`. No route, because the router is at the redirect target.
    span.setStatus({ code: SPAN_STATUS_OK });
    span.setAttribute(ERROR_TYPE, undefined);
    return;
  }

  // The Vue router resolves the route during the render, so it is only known now.
  const route = getMatchedRoute(data);
  if (route) {
    span.setAttribute(HTTP_ROUTE, route);
  }

  if (isFailedPageRender(data)) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
}

/** For a call without a key, Nuxt makes one: a hash that starts with `$`. It tells the user nothing. */
function getUserKey(key: unknown): string | undefined {
  return isString(key) && key && !key.startsWith('$') ? key : undefined;
}

function startDataSpan({ key, functionName }: NuxtDataPayload): Span | undefined {
  // No span without a request root span, for the same reason as in `startRenderSpan`.
  if (!getActiveSpan()) {
    return undefined;
  }

  // A production build of Nuxt sends the name only for `useLazyAsyncData`. All data composables call `useAsyncData`.
  const name = (isString(functionName) && functionName) || 'useAsyncData';
  const client = getClient();
  // Only with span streaming: Relay replaces the description of a transaction span with the span name.
  const description = client && hasSpanStreamingEnabled(client) ? getUserKey(key) : undefined;

  return startInactiveSpan({
    name,
    attributes: {
      [SENTRY_OP]: FUNCTION,
      [SENTRY_ORIGIN]: 'auto.function.nuxt.data',
      [CODE_FUNCTION_NAME]: name,
      // The key can have request data, for example an id, so it is not in the span name.
      ...(description && { [SENTRY_DESCRIPTION]: description }),
    },
  });
}

function setDataResult(span: Span, data: TracingChannelPayloadWithSpan<NuxtDataPayload>): void {
  if (!('error' in data)) {
    return;
  }

  const error: { name?: unknown; status?: unknown; statusCode?: unknown } = isObjectLike(data.error) ? data.error : {};

  // Nuxt aborts a handler when a new call with the same key replaces it, and does not treat that as an error.
  if (error.name === 'AbortError') {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    span.setAttribute(ERROR_TYPE, undefined);
    return;
  }

  // Replaces the error message in the status. The message of a failed `useFetch` has the URL with its query string.
  span.setStatus(getSpanStatusFromHttpCode(Number(error.status ?? error.statusCode)));
}

/** Makes spans from the `nuxt.*` tracing channels. Nuxt publishes nothing when the `nuxt` channel group is off. */
export const nuxtTracingChannelIntegration = defineIntegration(() => ({
  name: INTEGRATION_NAME,
  setupOnce() {
    if (!diagnosticsTracingChannel) {
      return;
    }

    // The `http.server` span of the runtime SDK stays the request root, not a `nuxt.request` or `srvx.request` span.
    // It also exists without these channels, and it already has the HTTP data and the incoming trace.
    bindTracingChannelToSpan(diagnosticsTracingChannel<NuxtRenderPayload>('nuxt.render'), startRenderSpan, {
      beforeSpanEnd: setRenderResult,
    });

    bindTracingChannelToSpan(diagnosticsTracingChannel<NuxtDataPayload>('nuxt.data'), startDataSpan, {
      beforeSpanEnd: setDataResult,
    });
  },
}));

/** Adds the integration next to the defaults, so that an `integrations` function of the user can remove it. */
export function withNuxtTracingChannelIntegration(
  userIntegrations: Options['integrations'],
): (defaultIntegrations: Integration[]) => Integration[] {
  return defaultIntegrations => {
    const integrations = [...defaultIntegrations, nuxtTracingChannelIntegration()];

    return typeof userIntegrations === 'function'
      ? userIntegrations(integrations)
      : [...integrations, ...(userIntegrations ?? [])];
  };
}
