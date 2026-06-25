/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/ed97091c9890dd18e52759f2ea98e9d7593b3ae4/packages/instrumentation-undici
 * - Upstream version: @opentelemetry/instrumentation-undici@0.24.0
 * - Tracking issue: https://github.com/getsentry/sentry-javascript/issues/20165
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 * - Dropped the OTel metrics (no MeterProvider is wired up) and the dead
 *   `requireParentforSpans` code path (the SDK always passes `false`)
 * - Dropped the `@opentelemetry/instrumentation` base (undici reports via `diagnostics_channel`,
 *   so no module patching was needed) — exposed as a plain `instrumentUndici()` function that the
 *   integration wires up directly
 */

/* eslint-disable max-lines */

import * as diagch from 'diagnostics_channel';
import { URL } from 'url';

import type { Span, SpanAttributes } from '@sentry/core';
import {
  debug,
  getClient,
  getTraceData,
  LRUMap,
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  shouldPropagateTraceForUrl,
  SPAN_KIND,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  stripDataUrlContent,
  withActiveSpan,
} from '@sentry/core';
import {
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  NETWORK_PEER_ADDRESS,
  NETWORK_PEER_PORT,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
  URL_PATH,
  URL_QUERY,
  URL_SCHEME,
  USER_AGENT_ORIGINAL,
} from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../debug-build';
import type {
  UndiciInstrumentationConfig,
  UndiciRequest,
  RequestErrorMessage,
  RequestHeadersMessage,
  RequestMessage,
  RequestTrailersMessage,
  ResponseHeadersMessage,
} from './types';

// `http.request.method_original` is not part of `@sentry/conventions`, so we keep it inline.
const ATTR_HTTP_REQUEST_METHOD_ORIGINAL = 'http.request.method_original';

// Keep ref to avoid https://github.com/nodejs/node/issues/42170 bug
// We can replace this with _isInstrumented once we drop support for Node.js 18.18.0
const _channelSubs: Array<unknown> = [];
const spanFromReq = new WeakMap<UndiciRequest, Span>();
// Caches trace-propagation decisions per URL so we don't recompute the `tracePropagationTargets` regexes per request.
const propagationDecisionMap = new LRUMap<string, boolean>(100);

/**
 * Instrument outgoing HTTP requests made through `undici` or the global `fetch` API: emit `http.client`
 * spans and propagate traces into the outgoing request headers.
 *
 * undici reports its request lifecycle via `diagnostics_channel`, so rather than patching any module we
 * subscribe to those channels directly. This is idempotent — subsequent calls are no-ops once the
 * channels have been subscribed to, and the config of the first call wins.
 *
 * A combination of https://github.com/elastic/apm-agent-nodejs and
 * https://github.com/gadget-inc/opentelemetry-instrumentations/blob/main/packages/opentelemetry-instrumentation-undici/src/index.ts
 */
export function instrumentUndici(config: UndiciInstrumentationConfig = {}): void {
  // Avoid duplicate subscriptions
  if (_channelSubs.length) {
    return;
  }

  subscribeToChannel('undici:request:create', message => onRequestCreated(config, message as RequestMessage));
  subscribeToChannel('undici:client:sendHeaders', message =>
    onRequestHeaders(config, message as RequestHeadersMessage),
  );
  subscribeToChannel('undici:request:headers', message => onResponseHeaders(config, message as ResponseHeadersMessage));
  subscribeToChannel('undici:request:trailers', message => onDone(message as RequestTrailersMessage));
  subscribeToChannel('undici:request:error', message => onError(message as RequestErrorMessage));
}

/** Replaces OTel's `safeExecuteInTheMiddle`: run `fn`, route any error to `onError`, and swallow it. */
function safeExecute<T>(fn: () => T, onError: (error: unknown) => void): T | undefined {
  try {
    return fn();
  } catch (error) {
    onError(error);
    return undefined;
  }
}

function subscribeToChannel(
  diagnosticChannel: string,
  onMessage: (message: unknown, name: string | symbol) => void,
): void {
  // `diagnostics_channel` had a ref counting bug until v18.19.0.
  // https://github.com/nodejs/node/pull/47520
  const [major = 0, minor = 0] = process.version
    .replace('v', '')
    .split('.')
    .map(n => Number(n));
  const useNewSubscribe = major > 18 || (major === 18 && minor >= 19);

  if (useNewSubscribe) {
    _channelSubs.push(diagch.subscribe?.(diagnosticChannel, onMessage));
  } else {
    _channelSubs.push(diagch.channel(diagnosticChannel).subscribe(onMessage));
  }
}

function parseRequestHeaders(request: UndiciRequest): Map<string, string | string[]> {
  const result = new Map<string, string | string[]>();

  if (Array.isArray(request.headers)) {
    // headers are an array [k1, v2, k2, v2] (undici v6+)
    // values could be string or a string[] for multiple values
    for (let i = 0; i < request.headers.length; i += 2) {
      const key = request.headers[i];
      const value = request.headers[i + 1];

      // Key should always be a string, but the types don't know that, and let's be safe
      if (typeof key === 'string' && value !== undefined) {
        result.set(key.toLowerCase(), value);
      }
    }
  } else if (typeof request.headers === 'string') {
    // headers are a raw string (undici v5)
    // headers could be repeated in several lines for multiple values
    const headers = request.headers.split('\r\n');
    for (const line of headers) {
      if (!line) {
        continue;
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        // Invalid header? Probably this can't happen, but again let's be safe.
        continue;
      }
      const key = line.substring(0, colonIndex).toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      const allValues = result.get(key);

      if (allValues && Array.isArray(allValues)) {
        allValues.push(value);
      } else if (allValues) {
        result.set(key, [allValues, value]);
      } else {
        result.set(key, value);
      }
    }
  }
  return result;
}

// This is the 1st message we receive for each request (fired after request creation). Here we will
// create the span and populate some atttributes, then link the span to the request for further
// span processing
function onRequestCreated(config: UndiciInstrumentationConfig, { request }: RequestMessage): void {
  const url = getAbsoluteUrl(request.origin, request.path);

  // Ignore if:
  // - the outgoing request is ignored via config
  // - method is 'CONNECT'
  const shouldIgnoreReq = safeExecute(
    () => request.method === 'CONNECT' || !!config.ignoreOutgoingRequests?.(url),
    e => e && DEBUG_BUILD && debug.error('caught ignoreOutgoingRequests error: ', e),
  );

  if (shouldIgnoreReq) {
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(request.path, request.origin);
  } catch (err) {
    DEBUG_BUILD && debug.warn('could not determine url.full:', err);
    // Skip instrumenting this request.
    return;
  }
  const urlScheme = requestUrl.protocol.replace(':', '');
  const requestMethod = getRequestMethod(request.method);
  const attributes: SpanAttributes = {
    [HTTP_REQUEST_METHOD]: requestMethod,
    [ATTR_HTTP_REQUEST_METHOD_ORIGINAL]: request.method,
    [URL_FULL]: requestUrl.toString(),
    [URL_PATH]: requestUrl.pathname,
    [URL_QUERY]: requestUrl.search,
    [URL_SCHEME]: urlScheme,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.node_fetch',
  };

  // Sanitize data URLs to prevent long base64 strings in span attributes
  if (url.startsWith('data:')) {
    const sanitizedUrl = stripDataUrlContent(url);
    attributes['http.url'] = sanitizedUrl;
    attributes[URL_FULL] = sanitizedUrl;
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME] = `${request.method || 'GET'} ${sanitizedUrl}`;
  }

  const schemePorts: Record<string, string> = { https: '443', http: '80' };
  const serverAddress = requestUrl.hostname;
  const serverPort = requestUrl.port || schemePorts[urlScheme];

  attributes[SERVER_ADDRESS] = serverAddress;
  if (serverPort && !isNaN(Number(serverPort))) {
    attributes[SERVER_PORT] = Number(serverPort);
  }

  // Get user agent from headers
  const headersMap = parseRequestHeaders(request);
  const userAgentValues = headersMap.get('user-agent');

  if (userAgentValues) {
    // NOTE: having multiple user agents is not expected so
    // we're going to take last one like `curl` does
    // ref: https://curl.se/docs/manpage.html#-A
    const userAgent = Array.isArray(userAgentValues) ? userAgentValues[userAgentValues.length - 1] : userAgentValues;
    attributes[USER_AGENT_ORIGINAL] = userAgent;
  }

  const span = startInactiveSpan({
    name: requestMethod === '_OTHER' ? 'HTTP' : requestMethod,
    kind: SPAN_KIND.CLIENT,
    attributes,
  });

  // Execute the request hook if defined
  safeExecute(
    () => config.requestHook?.(span, request),
    e => e && DEBUG_BUILD && debug.error('caught requestHook error: ', e),
  );

  // Context propagation goes last so no hook can tamper the propagation headers.
  // We propagate the trace data of the freshly created client span (not the active parent span)
  // so downstream services are parented to the http.client span, matching the upstream behavior.
  injectTracePropagationHeaders(span, request, requestUrl.toString());

  spanFromReq.set(request, span);
}

// This is the 2nd message we receive for each request. It is fired when connection with
// the remote is established and about to send the first byte. Here we do have info about the
// remote address and port so we can populate some `network.*` attributes into the span
function onRequestHeaders(config: UndiciInstrumentationConfig, { request, socket }: RequestHeadersMessage): void {
  const span = spanFromReq.get(request);

  if (!span) {
    return;
  }

  const { remoteAddress, remotePort } = socket;
  const spanAttributes: SpanAttributes = {
    [NETWORK_PEER_ADDRESS]: remoteAddress,
    [NETWORK_PEER_PORT]: remotePort,
  };

  // After hooks have been processed (which may modify request headers)
  // we can collect the headers based on the configuration
  if (config.headersToSpanAttributes?.requestHeaders) {
    const headersToAttribs = new Set(config.headersToSpanAttributes.requestHeaders.map(n => n.toLowerCase()));
    const headersMap = parseRequestHeaders(request);

    for (const [name, value] of headersMap.entries()) {
      if (headersToAttribs.has(name)) {
        const attrValue = Array.isArray(value) ? value : [value];
        spanAttributes[`http.request.header.${name}`] = attrValue;
      }
    }
  }

  span.setAttributes(spanAttributes);
}

// This is the 3rd message we get for each request and it's fired when the server
// headers are received, body may not be accessible yet.
// From the response headers we can set the status and content length
function onResponseHeaders(config: UndiciInstrumentationConfig, { request, response }: ResponseHeadersMessage): void {
  const span = spanFromReq.get(request);

  if (!span) {
    return;
  }

  const spanAttributes: SpanAttributes = {
    [HTTP_RESPONSE_STATUS_CODE]: response.statusCode,
  };

  // Execute the response hook if defined
  safeExecute(
    () => config.responseHook?.(span, { request, response }),
    e => e && DEBUG_BUILD && debug.error('caught responseHook error: ', e),
  );

  if (config.headersToSpanAttributes?.responseHeaders) {
    const headersToAttribs = new Set<string>();
    config.headersToSpanAttributes?.responseHeaders.forEach(name => headersToAttribs.add(name.toLowerCase()));

    for (let idx = 0; idx < response.headers.length; idx = idx + 2) {
      const nameBuf = response.headers[idx];
      const valueBuf = response.headers[idx + 1];
      if (nameBuf === undefined || valueBuf === undefined) {
        continue;
      }
      const name = nameBuf.toString().toLowerCase();
      const value = valueBuf;

      if (headersToAttribs.has(name)) {
        const attrName = `http.response.header.${name}`;
        if (!Object.prototype.hasOwnProperty.call(spanAttributes, attrName)) {
          spanAttributes[attrName] = [value.toString()];
        } else {
          (spanAttributes[attrName] as string[]).push(value.toString());
        }
      }
    }
  }

  span.setAttributes(spanAttributes);

  // The Sentry pipeline infers `ok` / `not_found` / etc. from `http.response.status_code` when the
  // status is left unset, so we only need to flag erroneous responses explicitly.
  if (response.statusCode >= 400) {
    span.setStatus({ code: SPAN_STATUS_ERROR });
  }
}

// This is the last event we receive if the request went without any errors
function onDone({ request }: RequestTrailersMessage): void {
  const span = spanFromReq.get(request);

  if (!span) {
    return;
  }

  span.end();
  spanFromReq.delete(request);
}

// This is the event we get when something is wrong in the request like
// - invalid options when calling `fetch` global API or any undici method for request
// - connectivity errors such as unreachable host
// - requests aborted through an `AbortController.signal`
// NOTE: server errors are considered valid responses and it's the lib consumer
// who should deal with that.
function onError({ request, error }: RequestErrorMessage): void {
  const span = spanFromReq.get(request);

  if (!span) {
    return;
  }

  // NOTE: in `undici@6.3.0` when request aborted the error type changes from
  // a custom error (`RequestAbortedError`) to a built-in `DOMException` carrying
  // some differences:
  // - `code` is from DOMEXception (ABORT_ERR: 20)
  // - `message` changes
  // - stacktrace is smaller and contains node internal frames
  span.setStatus({
    code: SPAN_STATUS_ERROR,
    message: error.message,
  });
  span.end();
  spanFromReq.delete(request);
}

// Propagate the trace data of the given (client) span into the outgoing request headers, gated by
// `tracePropagationTargets`. Mirrors what `propagation.inject()` did with the SentryPropagator, but
// via Sentry's `getTraceData()` so we stay off OpenTelemetry's propagation API.
function injectTracePropagationHeaders(span: Span, request: UndiciRequest, url: string): void {
  const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() ?? {};

  if (!shouldPropagateTraceForUrl(url, tracePropagationTargets, propagationDecisionMap)) {
    return;
  }

  // We make the freshly created client span active so the propagated headers reference it (and not
  // the parent span). Passing `{ span }` to `getTraceData()` is not enough: for an inactive span it
  // resolves to the span's *captured* scope, whose active span is still the parent.
  const addedHeaders = withActiveSpan(span, () => getTraceData({ propagateTraceparent }));

  for (const [k, v] of Object.entries(addedHeaders)) {
    if (!v) {
      continue;
    }

    if (typeof request.addHeader === 'function') {
      request.addHeader(k, v);
    } else if (typeof request.headers === 'string') {
      request.headers += `${k}: ${v}\r\n`;
    } else if (Array.isArray(request.headers)) {
      // undici@6.11.0 accidentally, briefly removed `request.addHeader()`.
      request.headers.push(k, v);
    }
  }
}

function getRequestMethod(original: string): string {
  const knownMethods = {
    CONNECT: true,
    OPTIONS: true,
    HEAD: true,
    GET: true,
    POST: true,
    PUT: true,
    PATCH: true,
    DELETE: true,
    TRACE: true,
    // QUERY from https://datatracker.ietf.org/doc/draft-ietf-httpbis-safe-method-w-body/
    QUERY: true,
  };

  if (original.toUpperCase() in knownMethods) {
    return original.toUpperCase();
  }

  return '_OTHER';
}

// Matching the behavior of the base instrumentation
function getAbsoluteUrl(origin: string, path: string = '/'): string {
  const url = `${origin}`;

  if (url.endsWith('/') && path.startsWith('/')) {
    return `${url}${path.slice(1)}`;
  }

  if (!url.endsWith('/') && !path.startsWith('/')) {
    return `${url}/${path}`;
  }

  return `${url}${path}`;
}
