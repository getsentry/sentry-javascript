/* eslint-disable max-lines */
import type * as http from 'http';
import type * as https from 'https';
import type { Hub } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { defineIntegration, getIsolationScope, hasTracingEnabled } from '@sentry/core';
import {
  addBreadcrumb,
  getClient,
  getCurrentHub,
  getCurrentScope,
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
  isSentryRequestUrl,
  setHttpStatus,
  spanToJSON,
  spanToTraceHeader,
} from '@sentry/core';
import type {
  ClientOptions,
  EventProcessor,
  Integration,
  IntegrationFn,
  IntegrationFnResult,
  SanitizedRequestData,
  TracePropagationTargets,
} from '@sentry/types';
import {
  LRUMap,
  dropUndefinedKeys,
  dynamicSamplingContextToSentryBaggageHeader,
  fill,
  generateSentryTraceHeader,
  logger,
  stringMatchesSomePattern,
} from '@sentry/utils';

import type { NodeClient } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { NODE_VERSION } from '../nodeVersion';
import type { NodeClientOptions } from '../types';
import type { RequestMethod, RequestMethodArgs, RequestOptions } from './utils/http';
import { cleanSpanName, extractRawUrl, extractUrl, normalizeRequestArgs } from './utils/http';

interface TracingOptions {
  /**
   * List of strings/regex controlling to which outgoing requests
   * the SDK will attach tracing headers.
   *
   * By default the SDK will attach those headers to all outgoing
   * requests. If this option is provided, the SDK will match the
   * request URL of outgoing requests against the items in this
   * array, and only attach tracing headers if a match was found.
   *
   * @deprecated Use top level `tracePropagationTargets` option instead.
   * This option will be removed in v8.
   *
   * ```
   * Sentry.init({
   *   tracePropagationTargets: ['api.site.com'],
   * })
   */
  tracePropagationTargets?: TracePropagationTargets;

  /**
   * Function determining whether or not to create spans to track outgoing requests to the given URL.
   * By default, spans will be created for all outgoing requests.
   */
  shouldCreateSpanForRequest?: (url: string) => boolean;

  /**
   * This option is just for compatibility with v7.
   * In v8, this will be the default behavior.
   */
  enableIfHasTracingEnabled?: boolean;
}

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for requests
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Whether tracing spans should be created for requests
   * Defaults to false
   */
  tracing?: TracingOptions | boolean;
}

/* These are the newer options for `httpIntegration`. */
interface HttpIntegrationOptions {
  /**
   * Whether breadcrumbs should be recorded for requests
   * Defaults to true.
   */
  breadcrumbs?: boolean;

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

const _httpIntegration = ((options: HttpIntegrationOptions = {}) => {
  const { breadcrumbs, tracing, shouldCreateSpanForRequest } = options;

  const convertedOptions: HttpOptions = {
    breadcrumbs,
    tracing:
      tracing === false
        ? false
        : dropUndefinedKeys({
            // If tracing is forced to `true`, we don't want to set `enableIfHasTracingEnabled`
            enableIfHasTracingEnabled: tracing === true ? undefined : true,
            shouldCreateSpanForRequest,
          }),
  };

  // eslint-disable-next-line deprecation/deprecation
  return new Http(convertedOptions) as unknown as IntegrationFnResult;
}) satisfies IntegrationFn;

/**
 * The http module integration instruments Node's internal http module. It creates breadcrumbs, spans for outgoing
 * http requests, and attaches trace data when tracing is enabled via its `tracing` option.
 *
 * By default, this will always create breadcrumbs, and will create spans if tracing is enabled.
 */
export const httpIntegration = defineIntegration(_httpIntegration);

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 *
 * @deprecated Use `httpIntegration()` instead.
 */
export class Http implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Http';

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line deprecation/deprecation
  public name: string = Http.id;

  private readonly _breadcrumbs: boolean;
  private readonly _tracing: TracingOptions | undefined;

  /**
   * @inheritDoc
   */
  public constructor(options: HttpOptions = {}) {
    this._breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
    this._tracing = !options.tracing ? undefined : options.tracing === true ? {} : options.tracing;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(
    _addGlobalEventProcessor: (callback: EventProcessor) => void,
    setupOnceGetCurrentHub: () => Hub,
  ): void {
    // eslint-disable-next-line deprecation/deprecation
    const clientOptions = setupOnceGetCurrentHub().getClient<NodeClient>()?.getOptions();

    // If `tracing` is not explicitly set, we default this based on whether or not tracing is enabled.
    // But for compatibility, we only do that if `enableIfHasTracingEnabled` is set.
    const shouldCreateSpans = _shouldCreateSpans(this._tracing, clientOptions);

    // No need to instrument if we don't want to track anything
    if (!this._breadcrumbs && !shouldCreateSpans) {
      return;
    }

    const shouldCreateSpanForRequest = _getShouldCreateSpanForRequest(shouldCreateSpans, this._tracing, clientOptions);

    // eslint-disable-next-line deprecation/deprecation
    const tracePropagationTargets = clientOptions?.tracePropagationTargets || this._tracing?.tracePropagationTargets;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const httpModule = require('http');
    const wrappedHttpHandlerMaker = _createWrappedRequestMethodFactory(
      httpModule,
      this._breadcrumbs,
      shouldCreateSpanForRequest,
      tracePropagationTargets,
    );
    fill(httpModule, 'get', wrappedHttpHandlerMaker);
    fill(httpModule, 'request', wrappedHttpHandlerMaker);

    // NOTE: Prior to Node 9, `https` used internals of `http` module, thus we don't patch it.
    // If we do, we'd get double breadcrumbs and double spans for `https` calls.
    // It has been changed in Node 9, so for all versions equal and above, we patch `https` separately.
    if (NODE_VERSION.major > 8) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const httpsModule = require('node:https');
      const wrappedHttpsHandlerMaker = _createWrappedRequestMethodFactory(
        httpsModule,
        this._breadcrumbs,
        shouldCreateSpanForRequest,
        tracePropagationTargets,
      );
      fill(httpsModule, 'get', wrappedHttpsHandlerMaker);
      fill(httpsModule, 'request', wrappedHttpsHandlerMaker);
    }
  }
}

// for ease of reading below
type OriginalRequestMethod = RequestMethod;
type WrappedRequestMethod = RequestMethod;
type WrappedRequestMethodFactory = (original: OriginalRequestMethod) => WrappedRequestMethod;

/**
 * Function which creates a function which creates wrapped versions of internal `request` and `get` calls within `http`
 * and `https` modules. (NB: Not a typo - this is a creator^2!)
 *
 * @param breadcrumbsEnabled Whether or not to record outgoing requests as breadcrumbs
 * @param tracingEnabled Whether or not to record outgoing requests as tracing spans
 *
 * @returns A function which accepts the exiting handler and returns a wrapped handler
 */
function _createWrappedRequestMethodFactory(
  httpModule: typeof http | typeof https,
  breadcrumbsEnabled: boolean,
  shouldCreateSpanForRequest: ((url: string) => boolean) | undefined,
  tracePropagationTargets: TracePropagationTargets | undefined,
): WrappedRequestMethodFactory {
  // We're caching results so we don't have to recompute regexp every time we create a request.
  const createSpanUrlMap = new LRUMap<string, boolean>(100);
  const headersUrlMap = new LRUMap<string, boolean>(100);

  const shouldCreateSpan = (url: string): boolean => {
    if (shouldCreateSpanForRequest === undefined) {
      return true;
    }

    const cachedDecision = createSpanUrlMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = shouldCreateSpanForRequest(url);
    createSpanUrlMap.set(url, decision);
    return decision;
  };

  const shouldAttachTraceData = (url: string): boolean => {
    if (tracePropagationTargets === undefined) {
      return true;
    }

    const cachedDecision = headersUrlMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = stringMatchesSomePattern(url, tracePropagationTargets);
    headersUrlMap.set(url, decision);
    return decision;
  };

  /**
   * Captures Breadcrumb based on provided request/response pair
   */
  function addRequestBreadcrumb(
    event: string,
    requestSpanData: SanitizedRequestData,
    req: http.ClientRequest,
    res?: http.IncomingMessage,
  ): void {
    // eslint-disable-next-line deprecation/deprecation
    if (!getCurrentHub().getIntegration(Http)) {
      return;
    }

    addBreadcrumb(
      {
        category: 'http',
        data: {
          status_code: res && res.statusCode,
          ...requestSpanData,
        },
        type: 'http',
      },
      {
        event,
        request: req,
        response: res,
      },
    );
  }

  return function wrappedRequestMethodFactory(originalRequestMethod: OriginalRequestMethod): WrappedRequestMethod {
    return function wrappedMethod(this: unknown, ...args: RequestMethodArgs): http.ClientRequest {
      const requestArgs = normalizeRequestArgs(httpModule, args);
      const requestOptions = requestArgs[0];
      const rawRequestUrl = extractRawUrl(requestOptions);
      const requestUrl = extractUrl(requestOptions);
      const client = getClient();

      // we don't want to record requests to Sentry as either breadcrumbs or spans, so just use the original method
      if (isSentryRequestUrl(requestUrl, client)) {
        return originalRequestMethod.apply(httpModule, requestArgs);
      }

      const scope = getCurrentScope();
      const isolationScope = getIsolationScope();

      const attributes = getRequestSpanData(requestUrl, requestOptions);

      const requestSpan = shouldCreateSpan(rawRequestUrl)
        ? startInactiveSpan({
            onlyIfParent: true,
            op: 'http.client',
            name: `${attributes['http.method']} ${attributes.url}`,
            attributes: {
              ...attributes,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.node.http',
            },
          })
        : undefined;

      if (client && shouldAttachTraceData(rawRequestUrl)) {
        const { traceId, spanId, sampled, dsc } = {
          ...isolationScope.getPropagationContext(),
          ...scope.getPropagationContext(),
        };

        const sentryTraceHeader = requestSpan
          ? spanToTraceHeader(requestSpan)
          : generateSentryTraceHeader(traceId, spanId, sampled);

        const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(
          dsc ||
            (requestSpan
              ? getDynamicSamplingContextFromSpan(requestSpan)
              : getDynamicSamplingContextFromClient(traceId, client)),
        );

        addHeadersToRequestOptions(requestOptions, requestUrl, sentryTraceHeader, sentryBaggageHeader);
      } else {
        DEBUG_BUILD &&
          logger.log(
            `[Tracing] Not adding sentry-trace header to outgoing request (${requestUrl}) due to mismatching tracePropagationTargets option.`,
          );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalRequestMethod
        .apply(httpModule, requestArgs)
        .once('response', function (this: http.ClientRequest, res: http.IncomingMessage): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;
          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('response', attributes, req, res);
          }
          if (requestSpan) {
            if (res.statusCode) {
              setHttpStatus(requestSpan, res.statusCode);
            }
            requestSpan.updateName(cleanSpanName(spanToJSON(requestSpan).description || '', requestOptions, req) || '');
            requestSpan.end();
          }
        })
        .once('error', function (this: http.ClientRequest): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;

          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('error', attributes, req);
          }
          if (requestSpan) {
            setHttpStatus(requestSpan, 500);
            requestSpan.updateName(cleanSpanName(spanToJSON(requestSpan).description || '', requestOptions, req) || '');
            requestSpan.end();
          }
        });
    };
  };
}

function addHeadersToRequestOptions(
  requestOptions: RequestOptions,
  requestUrl: string,
  sentryTraceHeader: string,
  sentryBaggageHeader: string | undefined,
): void {
  // Don't overwrite sentry-trace and baggage header if it's already set.
  const headers = requestOptions.headers || {};
  if (headers['sentry-trace']) {
    return;
  }

  DEBUG_BUILD &&
    logger.log(`[Tracing] Adding sentry-trace header ${sentryTraceHeader} to outgoing request to "${requestUrl}": `);

  requestOptions.headers = {
    ...requestOptions.headers,
    'sentry-trace': sentryTraceHeader,
    // Setting a header to `undefined` will crash in node so we only set the baggage header when it's defined
    ...(sentryBaggageHeader &&
      sentryBaggageHeader.length > 0 && { baggage: normalizeBaggageHeader(requestOptions, sentryBaggageHeader) }),
  };
}

function getRequestSpanData(requestUrl: string, requestOptions: RequestOptions): SanitizedRequestData {
  const method = requestOptions.method || 'GET';
  const data: SanitizedRequestData = {
    url: requestUrl,
    'http.method': method,
  };
  if (requestOptions.hash) {
    // strip leading "#"
    data['http.fragment'] = requestOptions.hash.substring(1);
  }
  if (requestOptions.search) {
    // strip leading "?"
    data['http.query'] = requestOptions.search.substring(1);
  }
  return data;
}

function normalizeBaggageHeader(
  requestOptions: RequestOptions,
  sentryBaggageHeader: string | undefined,
): string | string[] | undefined {
  if (!requestOptions.headers || !requestOptions.headers.baggage) {
    return sentryBaggageHeader;
  } else if (!sentryBaggageHeader) {
    return requestOptions.headers.baggage as string | string[];
  } else if (Array.isArray(requestOptions.headers.baggage)) {
    return [...requestOptions.headers.baggage, sentryBaggageHeader];
  }
  // Type-cast explanation:
  // Technically this the following could be of type `(number | string)[]` but for the sake of simplicity
  // we say this is undefined behaviour, since it would not be baggage spec conform if the user did this.
  return [requestOptions.headers.baggage, sentryBaggageHeader] as string[];
}

/** Exported for tests only. */
export function _shouldCreateSpans(
  tracingOptions: TracingOptions | undefined,
  clientOptions: Partial<ClientOptions> | undefined,
): boolean {
  return tracingOptions === undefined
    ? false
    : tracingOptions.enableIfHasTracingEnabled
      ? hasTracingEnabled(clientOptions)
      : true;
}

/** Exported for tests only. */
export function _getShouldCreateSpanForRequest(
  shouldCreateSpans: boolean,
  tracingOptions: TracingOptions | undefined,
  clientOptions: Partial<NodeClientOptions> | undefined,
): undefined | ((url: string) => boolean) {
  const handler = shouldCreateSpans
    ? // eslint-disable-next-line deprecation/deprecation
      tracingOptions?.shouldCreateSpanForRequest || clientOptions?.shouldCreateSpanForRequest
    : () => false;

  return handler;
}
