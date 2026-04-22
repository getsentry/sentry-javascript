/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/ed97091c9890dd18e52759f2ea98e9d7593b3ae4/packages/instrumentation-undici
 * - Upstream version: @opentelemetry/instrumentation-undici@0.24.0
 * - Tracking issue: https://github.com/getsentry/sentry-javascript/issues/20165
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable -- vendored @opentelemetry/instrumentation-undici (#20165) */

import * as diagch from 'diagnostics_channel';
import { URL } from 'url';

import { InstrumentationBase, safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import type { Attributes, Histogram, HrTime, Span } from '@opentelemetry/api';
import {
  context,
  INVALID_SPAN_CONTEXT,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  ValueType,
} from '@opentelemetry/api';
import { hrTime, hrTimeDuration, hrTimeToMilliseconds } from '@opentelemetry/core';
import {
  ATTR_ERROR_TYPE,
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
  METRIC_HTTP_CLIENT_REQUEST_DURATION,
} from '@opentelemetry/semantic-conventions';

import type {
  ListenerRecord,
  RequestHeadersMessage,
  RequestMessage,
  RequestTrailersMessage,
  ResponseHeadersMessage,
} from './internal-types';
import type { UndiciInstrumentationConfig, UndiciRequest } from './types';

import { SDK_VERSION } from '@sentry/core';

interface InstrumentationRecord {
  span: Span;
  attributes: Attributes;
  startTime: HrTime;
}

const PACKAGE_NAME = '@sentry/instrumentation-undici';

// A combination of https://github.com/elastic/apm-agent-nodejs and
// https://github.com/gadget-inc/opentelemetry-instrumentations/blob/main/packages/opentelemetry-instrumentation-undici/src/index.ts
export class UndiciInstrumentation extends InstrumentationBase<UndiciInstrumentationConfig> {
  // Keep ref to avoid https://github.com/nodejs/node/issues/42170 bug and for
  // unsubscribing.
  declare private _channelSubs: Array<ListenerRecord>;
  private _recordFromReq = new WeakMap<UndiciRequest, InstrumentationRecord>();

  declare private _httpClientDurationHistogram: Histogram;

  constructor(config: UndiciInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  // No need to instrument files/modules
  protected override init() {
    return undefined;
  }

  override disable(): void {
    super.disable();
    this._channelSubs.forEach(sub => sub.unsubscribe());
    this._channelSubs.length = 0;
  }

  override enable(): void {
    // "enabled" handling is currently a bit messy with InstrumentationBase.
    // If constructed with `{enabled: false}`, this `.enable()` is still called,
    // and `this.getConfig().enabled !== this.isEnabled()`, creating confusion.
    //
    // For now, this class will setup for instrumenting if `.enable()` is
    // called, but use `this.getConfig().enabled` to determine if
    // instrumentation should be generated. This covers the more likely common
    // case of config being given a construction time, rather than later via
    // `instance.enable()`, `.disable()`, or `.setConfig()` calls.
    super.enable();

    // This method is called by the super-class constructor before ours is
    // called. So we need to ensure the property is initalized.
    this._channelSubs = this._channelSubs || [];

    // Avoid to duplicate subscriptions
    if (this._channelSubs.length > 0) {
      return;
    }

    this.subscribeToChannel('undici:request:create', this.onRequestCreated.bind(this));
    this.subscribeToChannel('undici:client:sendHeaders', this.onRequestHeaders.bind(this));
    this.subscribeToChannel('undici:request:headers', this.onResponseHeaders.bind(this));
    this.subscribeToChannel('undici:request:trailers', this.onDone.bind(this));
    this.subscribeToChannel('undici:request:error', this.onError.bind(this));
  }

  protected override _updateMetricInstruments() {
    this._httpClientDurationHistogram = this.meter.createHistogram(METRIC_HTTP_CLIENT_REQUEST_DURATION, {
      description: 'Measures the duration of outbound HTTP requests.',
      unit: 's',
      valueType: ValueType.DOUBLE,
      advice: {
        explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10],
      },
    });
  }

  private subscribeToChannel(diagnosticChannel: string, onMessage: (message: any, name: string | symbol) => void) {
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

  private parseRequestHeaders(request: UndiciRequest) {
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
    const config = this.getConfig();
    const enabled = config.enabled !== false;
    const shouldIgnoreReq = safeExecuteInTheMiddle(
      () => !enabled || request.method === 'CONNECT' || config.ignoreRequestHook?.(request),
      e => e && this._diag.error('caught ignoreRequestHook error: ', e),
      true,
    );

    if (shouldIgnoreReq) {
      return;
    }

    const startTime = hrTime();
    let requestUrl;
    try {
      requestUrl = new URL(request.path, request.origin);
    } catch (err) {
      this._diag.warn('could not determine url.full:', err);
      // Skip instrumenting this request.
      return;
    }
    const urlScheme = requestUrl.protocol.replace(':', '');
    const requestMethod = this.getRequestMethod(request.method);
    const attributes: Attributes = {
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
    const hookAttributes = safeExecuteInTheMiddle(
      () => config.startSpanHook?.(request),
      e => e && this._diag.error('caught startSpanHook error: ', e),
      true,
    );
    if (hookAttributes) {
      Object.entries(hookAttributes).forEach(([key, val]) => {
        attributes[key] = val;
      });
    }

    // Check if parent span is required via config and:
    // - if a parent is required but not present, we use a `NoopSpan` to still
    //   propagate context without recording it.
    // - create a span otherwise
    const activeCtx = context.active();
    const currentSpan = trace.getSpan(activeCtx);
    let span: Span;

    if (config.requireParentforSpans && (!currentSpan || !trace.isSpanContextValid(currentSpan.spanContext()))) {
      span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
    } else {
      span = this.tracer.startSpan(
        requestMethod === '_OTHER' ? 'HTTP' : requestMethod,
        {
          kind: SpanKind.CLIENT,
          attributes: attributes,
        },
        activeCtx,
      );
    }

    // Execute the request hook if defined
    safeExecuteInTheMiddle(
      () => config.requestHook?.(span, request),
      e => e && this._diag.error('caught requestHook error: ', e),
      true,
    );

    // Context propagation goes last so no hook can tamper
    // the propagation headers
    const requestContext = trace.setSpan(context.active(), span);
    const addedHeaders: Record<string, string> = {};
    propagation.inject(requestContext, addedHeaders);

    const headerEntries = Object.entries(addedHeaders);

    for (let i = 0; i < headerEntries.length; i++) {
      const pair = headerEntries[i];
      if (!pair) {
        continue;
      }
      const [k, v] = pair;

      if (typeof request.addHeader === 'function') {
        request.addHeader(k, v);
      } else if (typeof request.headers === 'string') {
        request.headers += `${k}: ${v}\r\n`;
      } else if (Array.isArray(request.headers)) {
        // undici@6.11.0 accidentally, briefly removed `request.addHeader()`.
        request.headers.push(k, v);
      }
    }
    this._recordFromReq.set(request, { span, attributes, startTime });
  }

  // This is the 2nd message we receive for each request. It is fired when connection with
  // the remote is established and about to send the first byte. Here we do have info about the
  // remote address and port so we can populate some `network.*` attributes into the span
  private onRequestHeaders({ request, socket }: RequestHeadersMessage): void {
    const record = this._recordFromReq.get(request);

    if (!record) {
      return;
    }

    const config = this.getConfig();
    const { span } = record;
    const { remoteAddress, remotePort } = socket;
    const spanAttributes: Attributes = {
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
    const record = this._recordFromReq.get(request);

    if (!record) {
      return;
    }

    const { span, attributes } = record;
    const spanAttributes: Attributes = {
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: response.statusCode,
    };

    const config = this.getConfig();

    // Execute the response hook if defined
    safeExecuteInTheMiddle(
      () => config.responseHook?.(span, { request, response }),
      e => e && this._diag.error('caught responseHook error: ', e),
      true,
    );

    if (config.headersToSpanAttributes?.responseHeaders) {
      const headersToAttribs = new Set();
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
    span.setStatus({
      code: response.statusCode >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.UNSET,
    });
    record.attributes = Object.assign(attributes, spanAttributes);
  }

  // This is the last event we receive if the request went without any errors
  private onDone({ request }: RequestTrailersMessage): void {
    const record = this._recordFromReq.get(request);

    if (!record) {
      return;
    }

    const { span, attributes, startTime } = record;

    // End the span
    span.end();
    this._recordFromReq.delete(request);

    // Record metrics
    this.recordRequestDuration(attributes, startTime);
  }

  // This is the event we get when something is wrong in the request like
  // - invalid options when calling `fetch` global API or any undici method for request
  // - connectivity errors such as unreachable host
  // - requests aborted through an `AbortController.signal`
  // NOTE: server errors are considered valid responses and it's the lib consumer
  // who should deal with that.
  private onError({ request, error }: any): void {
    const record = this._recordFromReq.get(request);

    if (!record) {
      return;
    }

    const { span, attributes, startTime } = record;

    // NOTE: in `undici@6.3.0` when request aborted the error type changes from
    // a custom error (`RequestAbortedError`) to a built-in `DOMException` carrying
    // some differences:
    // - `code` is from DOMEXception (ABORT_ERR: 20)
    // - `message` changes
    // - stacktrace is smaller and contains node internal frames
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.end();
    this._recordFromReq.delete(request);

    // Record metrics (with the error)
    attributes[ATTR_ERROR_TYPE] = error.message;
    this.recordRequestDuration(attributes, startTime);
  }

  private recordRequestDuration(attributes: Attributes, startTime: HrTime) {
    // Time to record metrics
    const metricsAttributes: Attributes = {};
    // Get the attribs already in span attributes
    const keysToCopy = [
      ATTR_HTTP_RESPONSE_STATUS_CODE,
      ATTR_HTTP_REQUEST_METHOD,
      ATTR_SERVER_ADDRESS,
      ATTR_SERVER_PORT,
      ATTR_URL_SCHEME,
      ATTR_ERROR_TYPE,
    ];
    keysToCopy.forEach(key => {
      if (key in attributes) {
        metricsAttributes[key] = attributes[key];
      }
    });

    // Take the duration and record it
    const durationSeconds = hrTimeToMilliseconds(hrTimeDuration(startTime, hrTime())) / 1000;
    this._httpClientDurationHistogram.record(durationSeconds, metricsAttributes);
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
