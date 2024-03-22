import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import {
  SPAN_STATUS_ERROR,
  addBreadcrumb,
  defineIntegration,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  hasTracingEnabled,
  isSentryRequestUrl,
  setHttpStatus,
  spanToTraceHeader,
} from '@sentry/core';
import type {
  EventProcessor,
  Integration,
  IntegrationFn,
  IntegrationFnResult,
  Span,
  SpanAttributes,
} from '@sentry/types';
import {
  LRUMap,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  getSanitizedUrlString,
  parseUrl,
  stringMatchesSomePattern,
} from '@sentry/utils';

import type { NodeClient } from '../../client';
import { NODE_VERSION } from '../../nodeVersion';
import type {
  DiagnosticsChannel,
  RequestCreateMessage,
  RequestEndMessage,
  RequestErrorMessage,
  RequestWithSentry,
} from './types';

export enum ChannelName {
  // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md#undicirequestcreate
  RequestCreate = 'undici:request:create',
  RequestEnd = 'undici:request:headers',
  RequestError = 'undici:request:error',
}

export interface UndiciOptions {
  /**
   * Whether breadcrumbs should be recorded for requests
   * Defaults to true
   */
  breadcrumbs: boolean;

  /**
   * Whether tracing spans should be created for requests
   * If not set, this will be enabled/disabled based on if tracing is enabled.
   */
  tracing?: boolean;

  /**
   * Function determining whether or not to create spans to track outgoing requests to the given URL.
   * By default, spans will be created for all outgoing requests.
   */
  shouldCreateSpanForRequest?: (url: string) => boolean;
}

// Please note that you cannot use `console.log` to debug the callbacks registered to the `diagnostics_channel` API.
// To debug, you can use `writeFileSync` to write to a file:
// https://nodejs.org/api/async_hooks.html#printing-in-asynchook-callbacks
//
// import { writeFileSync } from 'fs';
// import { format } from 'util';
//
// function debug(...args: any): void {
//   // Use a function like this one when debugging inside an AsyncHook callback
//   // @ts-expect-error any
//   writeFileSync('log.out', `${format(...args)}\n`, { flag: 'a' });
// }

const _nativeNodeFetchintegration = ((options?: Partial<UndiciOptions>) => {
  // eslint-disable-next-line deprecation/deprecation
  return new Undici(options) as unknown as IntegrationFnResult;
}) satisfies IntegrationFn;

export const nativeNodeFetchintegration = defineIntegration(_nativeNodeFetchintegration);

/**
 * Instruments outgoing HTTP requests made with the `undici` package via
 * Node's `diagnostics_channel` API.
 *
 * Supports Undici 4.7.0 or higher.
 *
 * Requires Node 16.17.0 or higher.
 *
 * @deprecated Use `nativeNodeFetchintegration()` instead.
 */
export class Undici implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Undici';

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  public name: string = Undici.id;

  private readonly _options: UndiciOptions;

  private readonly _createSpanUrlMap: LRUMap<string, boolean> = new LRUMap(100);
  private readonly _headersUrlMap: LRUMap<string, boolean> = new LRUMap(100);

  public constructor(_options: Partial<UndiciOptions> = {}) {
    this._options = {
      breadcrumbs: _options.breadcrumbs === undefined ? true : _options.breadcrumbs,
      tracing: _options.tracing,
      shouldCreateSpanForRequest: _options.shouldCreateSpanForRequest,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    // Requires Node 16+ to use the diagnostics_channel API.
    if (NODE_VERSION.major < 16) {
      return;
    }

    let ds: DiagnosticsChannel | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ds = require('diagnostics_channel') as DiagnosticsChannel;
    } catch (e) {
      // no-op
    }

    if (!ds || !ds.subscribe) {
      return;
    }

    // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md
    ds.subscribe(ChannelName.RequestCreate, this._onRequestCreate);
    ds.subscribe(ChannelName.RequestEnd, this._onRequestEnd);
    ds.subscribe(ChannelName.RequestError, this._onRequestError);
  }

  /** Helper that wraps shouldCreateSpanForRequest option */
  private _shouldCreateSpan(url: string): boolean {
    if (this._options.tracing === false || (this._options.tracing === undefined && !hasTracingEnabled())) {
      return false;
    }

    if (this._options.shouldCreateSpanForRequest === undefined) {
      return true;
    }

    const cachedDecision = this._createSpanUrlMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = this._options.shouldCreateSpanForRequest(url);
    this._createSpanUrlMap.set(url, decision);
    return decision;
  }

  private _onRequestCreate = (message: unknown): void => {
    if (!getClient()?.getIntegrationByName('Undici')) {
      return;
    }

    const { request } = message as RequestCreateMessage;

    const stringUrl = request.origin ? request.origin.toString() + request.path : request.path;

    const client = getClient<NodeClient>();
    if (!client) {
      return;
    }

    if (isSentryRequestUrl(stringUrl, client) || request.__sentry_span__ !== undefined) {
      return;
    }

    const clientOptions = client.getOptions();
    const scope = getCurrentScope();
    const isolationScope = getIsolationScope();

    const span = this._shouldCreateSpan(stringUrl) ? createRequestSpan(request, stringUrl) : undefined;
    if (span) {
      request.__sentry_span__ = span;
    }

    const shouldAttachTraceData = (url: string): boolean => {
      if (clientOptions.tracePropagationTargets === undefined) {
        return true;
      }

      const cachedDecision = this._headersUrlMap.get(url);
      if (cachedDecision !== undefined) {
        return cachedDecision;
      }

      const decision = stringMatchesSomePattern(url, clientOptions.tracePropagationTargets);
      this._headersUrlMap.set(url, decision);
      return decision;
    };

    if (shouldAttachTraceData(stringUrl)) {
      const { traceId, spanId, sampled, dsc } = {
        ...isolationScope.getPropagationContext(),
        ...scope.getPropagationContext(),
      };

      const sentryTraceHeader = span ? spanToTraceHeader(span) : generateSentryTraceHeader(traceId, spanId, sampled);

      const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(
        dsc || (span ? getDynamicSamplingContextFromSpan(span) : getDynamicSamplingContextFromClient(traceId, client)),
      );

      setHeadersOnRequest(request, sentryTraceHeader, sentryBaggageHeader);
    }
  };

  private _onRequestEnd = (message: unknown): void => {
    if (!getClient()?.getIntegrationByName('Undici')) {
      return;
    }

    const { request, response } = message as RequestEndMessage;

    const stringUrl = request.origin ? request.origin.toString() + request.path : request.path;

    if (isSentryRequestUrl(stringUrl, getClient())) {
      return;
    }

    const span = request.__sentry_span__;
    if (span) {
      setHttpStatus(span, response.statusCode);
      span.end();
    }

    if (this._options.breadcrumbs) {
      addBreadcrumb(
        {
          category: 'http',
          data: {
            method: request.method,
            status_code: response.statusCode,
            url: stringUrl,
          },
          type: 'http',
        },
        {
          event: 'response',
          request,
          response,
        },
      );
    }
  };

  private _onRequestError = (message: unknown): void => {
    if (!getClient()?.getIntegrationByName('Undici')) {
      return;
    }

    const { request } = message as RequestErrorMessage;

    const stringUrl = request.origin ? request.origin.toString() + request.path : request.path;

    if (isSentryRequestUrl(stringUrl, getClient())) {
      return;
    }

    const span = request.__sentry_span__;
    if (span) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      span.end();
    }

    if (this._options.breadcrumbs) {
      addBreadcrumb(
        {
          category: 'http',
          data: {
            method: request.method,
            url: stringUrl,
          },
          level: 'error',
          type: 'http',
        },
        {
          event: 'error',
          request,
        },
      );
    }
  };
}

function setHeadersOnRequest(
  request: RequestWithSentry,
  sentryTrace: string,
  sentryBaggageHeader: string | undefined,
): void {
  let hasSentryHeaders: boolean;
  if (Array.isArray(request.headers)) {
    hasSentryHeaders = request.headers.some(headerLine => headerLine === 'sentry-trace');
  } else {
    const headerLines = request.headers.split('\r\n');
    hasSentryHeaders = headerLines.some(headerLine => headerLine.startsWith('sentry-trace:'));
  }

  if (hasSentryHeaders) {
    return;
  }

  request.addHeader('sentry-trace', sentryTrace);
  if (sentryBaggageHeader) {
    request.addHeader('baggage', sentryBaggageHeader);
  }
}

function createRequestSpan(request: RequestWithSentry, stringUrl: string): Span {
  const url = parseUrl(stringUrl);

  const method = request.method || 'GET';
  const attributes: SpanAttributes = {
    'http.method': method,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.node.undici',
  };
  if (url.search) {
    attributes['http.query'] = url.search;
  }
  if (url.hash) {
    attributes['http.fragment'] = url.hash;
  }
  return startInactiveSpan({
    onlyIfParent: true,
    op: 'http.client',
    name: `${method} ${getSanitizedUrlString(url)}`,
    attributes,
  });
}
