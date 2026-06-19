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
 *   so no module patching was needed) — now a plain class wired up directly by the integration
 */

import * as diagch from 'diagnostics_channel';
import { URL } from 'url';

import type { Span, SpanAttributes } from '@sentry/core';
import {
  debug,
  getClient,
  getTraceData,
  LRUMap,
  shouldPropagateTraceForUrl,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_REQUEST_METHOD_ORIGINAL,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_PEER_PORT,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ATTR_URL_FULL,
  ATTR_URL_PATH,
  ATTR_URL_QUERY,
  ATTR_URL_SCHEME,
  ATTR_USER_AGENT_ORIGINAL,
} from './semconv';

import type {
  ListenerRecord,
  RequestErrorMessage,
  RequestHeadersMessage,
  RequestMessage,
  RequestTrailersMessage,
  ResponseHeadersMessage,
} from './internal-types';
import type { UndiciInstrumentationConfig, UndiciRequest } from './types';

// `SpanKind.CLIENT`, inlined to avoid importing from `@opentelemetry/api`.
const SPAN_KIND_CLIENT = 2;

/** Replaces OTel's `safeExecuteInTheMiddle`: run `fn`, route any error to `onError`, and swallow it. */
function safeExecute<T>(fn: () => T, onError: (error: unknown) => void): T | undefined {
  try {
    return fn();
  } catch (error) {
    onError(error);
    return undefined;
  }
}

// A combination of https://github.com/elastic/apm-agent-nodejs and
// https://github.com/gadget-inc/opentelemetry-instrumentations/blob/main/packages/opentelemetry-instrumentation-undici/src/index.ts
//
// Not an OTel `InstrumentationBase` (undici reports via `diagnostics_channel`, not module patching);
// the integration wires this up directly via `enable()` / `disable()`.
export class UndiciInstrumentation {
  // Keep ref to avoid https://github.com/nodejs/node/issues/42170 bug and for unsubscribing.
  private _channelSubs: Array<ListenerRecord> = [];
  private _spanFromReq = new WeakMap<UndiciRequest, Span>();
  // Caches trace-propagation decisions per URL so we don't recompute the `tracePropagationTargets` regexes per request.
  private _propagationDecisionMap = new LRUMap<string, boolean>(100);
  private _config: UndiciInstrumentationConfig;

  constructor(config: UndiciInstrumentationConfig = {}) {
    this._config = config;
  }

  public disable(): void {
    this._channelSubs.forEach(sub => sub.unsubscribe());
    this._channelSubs.length = 0;
  }

  /** Subscribe to the undici diagnostics channels (idempotent). */
  public enable(): void {
    // Avoid duplicate subscriptions
    if (this._channelSubs.length > 0) {
      return;
    }

    this.subscribeToChannel('undici:request:create', this.onRequestCreated.bind(this));
    this.subscribeToChannel('undici:client:sendHeaders', this.onRequestHeaders.bind(this));
    this.subscribeToChannel('undici:request:headers', this.onResponseHeaders.bind(this));
    this.subscribeToChannel('undici:request:trailers', this.onDone.bind(this));
    this.subscribeToChannel('undici:request:error', this.onError.bind(this));
  }

  private subscribeToChannel(
    diagnosticChannel: string,
    onMessage: (message: any, name: string | symbol) => void,
  ): void {
    // `diagnostics_channel` had a ref counting bug until v18.19.0.
    // https://github.com/nodejs/node/pull/47520
    const [major = 0, minor = 0] = process.version
      .replace('v', '')
      .split('.')
      .map(n => Number(n));
    const useNewSubscribe = major > 18 || (major === 18 && minor >= 19);

    let unsubscribe: () => void;
    if (useNewSubscribe) {
      diagch.subscribe?.(diagnosticChannel, onMessage);
      unsubscribe = () => diagch.unsubscribe?.(diagnosticChannel, onMessage);
    } else {
      const channel = diagch.channel(diagnosticChannel);
      channel.subscribe(onMessage);
      unsubscribe = () => channel.unsubscribe(onMessage);
    }

    this._channelSubs.push({
      name: diagnosticChannel,
      unsubscribe,
    });
  }

  private parseRequestHeaders(request: UndiciRequest): Map<string, string | string[]> {
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
  private onRequestCreated({ request }: RequestMessage): void {
    // Ignore if:
    // - instrumentation is disabled
    // - ignored by config
    // - method is 'CONNECT'
    const config = this._config;
    const enabled = config.enabled !== false;
    const shouldIgnoreReq = safeExecute(
      () => !enabled || request.method === 'CONNECT' || config.ignoreRequestHook?.(request),
      e => e && DEBUG_BUILD && debug.error('caught ignoreRequestHook error: ', e),
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
    const requestMethod = this.getRequestMethod(request.method);
    const attributes: SpanAttributes = {
      [ATTR_HTTP_REQUEST_METHOD]: requestMethod,
      [ATTR_HTTP_REQUEST_METHOD_ORIGINAL]: request.method,
      [ATTR_URL_FULL]: requestUrl.toString(),
      [ATTR_URL_PATH]: requestUrl.pathname,
      [ATTR_URL_QUERY]: requestUrl.search,
      [ATTR_URL_SCHEME]: urlScheme,
    };

    const schemePorts: Record<string, string> = { https: '443', http: '80' };
    const serverAddress = requestUrl.hostname;
    const serverPort = requestUrl.port || schemePorts[urlScheme];

    attributes[ATTR_SERVER_ADDRESS] = serverAddress;
    if (serverPort && !isNaN(Number(serverPort))) {
      attributes[ATTR_SERVER_PORT] = Number(serverPort);
    }

    // Get user agent from headers
    const headersMap = this.parseRequestHeaders(request);
    const userAgentValues = headersMap.get('user-agent');

    if (userAgentValues) {
      // NOTE: having multiple user agents is not expected so
      // we're going to take last one like `curl` does
      // ref: https://curl.se/docs/manpage.html#-A
      const userAgent = Array.isArray(userAgentValues) ? userAgentValues[userAgentValues.length - 1] : userAgentValues;
      attributes[ATTR_USER_AGENT_ORIGINAL] = userAgent;
    }

    // Get attributes from the hook if present
    const hookAttributes = safeExecute(
      () => config.startSpanHook?.(request),
      e => e && DEBUG_BUILD && debug.error('caught startSpanHook error: ', e),
    );
    if (hookAttributes) {
      Object.entries(hookAttributes).forEach(([key, val]) => {
        attributes[key] = val;
      });
    }

    const span = startInactiveSpan({
      name: requestMethod === '_OTHER' ? 'HTTP' : requestMethod,
      kind: SPAN_KIND_CLIENT,
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
    this.injectTracePropagationHeaders(span, request, requestUrl.toString());

    this._spanFromReq.set(request, span);
  }

  // This is the 2nd message we receive for each request. It is fired when connection with
  // the remote is established and about to send the first byte. Here we do have info about the
  // remote address and port so we can populate some `network.*` attributes into the span
  private onRequestHeaders({ request, socket }: RequestHeadersMessage): void {
    const span = this._spanFromReq.get(request);

    if (!span) {
      return;
    }

    const config = this._config;
    const { remoteAddress, remotePort } = socket;
    const spanAttributes: SpanAttributes = {
      [ATTR_NETWORK_PEER_ADDRESS]: remoteAddress,
      [ATTR_NETWORK_PEER_PORT]: remotePort,
    };

    // After hooks have been processed (which may modify request headers)
    // we can collect the headers based on the configuration
    if (config.headersToSpanAttributes?.requestHeaders) {
      const headersToAttribs = new Set(config.headersToSpanAttributes.requestHeaders.map(n => n.toLowerCase()));
      const headersMap = this.parseRequestHeaders(request);

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
  private onResponseHeaders({ request, response }: ResponseHeadersMessage): void {
    const span = this._spanFromReq.get(request);

    if (!span) {
      return;
    }

    const spanAttributes: SpanAttributes = {
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: response.statusCode,
    };

    const config = this._config;

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
  private onDone({ request }: RequestTrailersMessage): void {
    const span = this._spanFromReq.get(request);

    if (!span) {
      return;
    }

    span.end();
    this._spanFromReq.delete(request);
  }

  // This is the event we get when something is wrong in the request like
  // - invalid options when calling `fetch` global API or any undici method for request
  // - connectivity errors such as unreachable host
  // - requests aborted through an `AbortController.signal`
  // NOTE: server errors are considered valid responses and it's the lib consumer
  // who should deal with that.
  private onError({ request, error }: RequestErrorMessage): void {
    const span = this._spanFromReq.get(request);

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
    this._spanFromReq.delete(request);
  }

  // Propagate the trace data of the given (client) span into the outgoing request headers, gated by
  // `tracePropagationTargets`. Mirrors what `propagation.inject()` did with the SentryPropagator, but
  // via Sentry's `getTraceData()` so we stay off OpenTelemetry's propagation API.
  private injectTracePropagationHeaders(span: Span, request: UndiciRequest, url: string): void {
    const { tracePropagationTargets, propagateTraceparent } = getClient()?.getOptions() ?? {};

    if (!shouldPropagateTraceForUrl(url, tracePropagationTargets, this._propagationDecisionMap)) {
      return;
    }

    // We make the freshly created client span active so the propagated headers reference it (and not
    // the parent span). Passing `{ span }` to `getTraceData()` is not enough: for an inactive span it
    // resolves to the span's *captured* scope, whose active span is still the parent.
    const addedHeaders = withActiveSpan(span, () => getTraceData({ propagateTraceparent }));

    const headerEntries = Object.entries(addedHeaders);

    for (let i = 0; i < headerEntries.length; i++) {
      const pair = headerEntries[i];
      if (!pair) {
        continue;
      }
      const [k, v] = pair;
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

  private getRequestMethod(original: string): string {
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
}
