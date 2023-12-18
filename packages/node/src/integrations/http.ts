import type * as http from 'http';
import type * as https from 'https';
import type { Hub } from '@sentry/core';
import { getClient, getCurrentScope } from '@sentry/core';
import { getCurrentHub, getDynamicSamplingContextFromClient, isSentryRequestUrl } from '@sentry/core';
import type {
  DynamicSamplingContext,
  EventProcessor,
  Integration,
  SanitizedRequestData,
  TracePropagationTargets,
} from '@sentry/types';
import {
  LRUMap,
  dynamicSamplingContextToSentryBaggageHeader,
  fill,
  generateSentryTraceHeader,
  logger,
  stringMatchesSomePattern,
} from '@sentry/utils';

import type { NodeClient } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { NODE_VERSION } from '../nodeVersion';
import type { RequestMethod, RequestMethodArgs, RequestOptions } from './utils/http';
import { cleanSpanDescription, extractRawUrl, extractUrl, normalizeRequestArgs } from './utils/http';

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

/**
 * The http module integration instruments Node's internal http module. It creates breadcrumbs, transactions for outgoing
 * http requests and attaches trace data when tracing is enabled via its `tracing` option.
 */
export class Http implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Http';

  /**
   * @inheritDoc
   */
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
    // No need to instrument if we don't want to track anything
    if (!this._breadcrumbs && !this._tracing) {
      return;
    }

    const clientOptions = setupOnceGetCurrentHub().getClient<NodeClient>()?.getOptions();

    // Do not auto-instrument for other instrumenter
    if (clientOptions && clientOptions.instrumenter !== 'sentry') {
      DEBUG_BUILD && logger.log('HTTP Integration is skipped because of instrumenter configuration.');
      return;
    }

    const shouldCreateSpanForRequest =
      // eslint-disable-next-line deprecation/deprecation
      this._tracing?.shouldCreateSpanForRequest || clientOptions?.shouldCreateSpanForRequest;
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
    if (NODE_VERSION.major && NODE_VERSION.major > 8) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const httpsModule = require('https');
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
    if (!getCurrentHub().getIntegration(Http)) {
      return;
    }

    getCurrentHub().addBreadcrumb(
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
      // eslint-disable-next-line deprecation/deprecation
      const rawRequestUrl = extractRawUrl(requestOptions);
      const requestUrl = extractUrl(requestOptions);

      // we don't want to record requests to Sentry as either breadcrumbs or spans, so just use the original method
      if (isSentryRequestUrl(requestUrl, getClient())) {
        return originalRequestMethod.apply(httpModule, requestArgs);
      }

      const scope = getCurrentScope();
      const parentSpan = scope.getSpan();

      const data = getRequestSpanData(requestUrl, requestOptions);

      const requestSpan = shouldCreateSpan(rawRequestUrl)
        ? parentSpan?.startChild({
            op: 'http.client',
            origin: 'auto.http.node.http',
            description: `${data['http.method']} ${data.url}`,
            data,
          })
        : undefined;

      if (shouldAttachTraceData(rawRequestUrl)) {
        if (requestSpan) {
          const sentryTraceHeader = requestSpan.toTraceparent();
          const dynamicSamplingContext = requestSpan?.transaction?.getDynamicSamplingContext();
          addHeadersToRequestOptions(requestOptions, requestUrl, sentryTraceHeader, dynamicSamplingContext);
        } else {
          const client = getClient();
          const { traceId, sampled, dsc } = scope.getPropagationContext();
          const sentryTraceHeader = generateSentryTraceHeader(traceId, undefined, sampled);
          const dynamicSamplingContext =
            dsc || (client ? getDynamicSamplingContextFromClient(traceId, client, scope) : undefined);
          addHeadersToRequestOptions(requestOptions, requestUrl, sentryTraceHeader, dynamicSamplingContext);
        }
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
            addRequestBreadcrumb('response', data, req, res);
          }
          if (requestSpan) {
            if (res.statusCode) {
              requestSpan.setHttpStatus(res.statusCode);
            }
            requestSpan.description = cleanSpanDescription(requestSpan.description, requestOptions, req);
            requestSpan.finish();
          }
        })
        .once('error', function (this: http.ClientRequest): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;

          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('error', data, req);
          }
          if (requestSpan) {
            requestSpan.setHttpStatus(500);
            requestSpan.description = cleanSpanDescription(requestSpan.description, requestOptions, req);
            requestSpan.finish();
          }
        });
    };
  };
}

function addHeadersToRequestOptions(
  requestOptions: RequestOptions,
  requestUrl: string,
  sentryTraceHeader: string,
  dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined,
): void {
  // Don't overwrite sentry-trace and baggage header if it's already set.
  const headers = requestOptions.headers || {};
  if (headers['sentry-trace']) {
    return;
  }

  DEBUG_BUILD &&
    logger.log(`[Tracing] Adding sentry-trace header ${sentryTraceHeader} to outgoing request to "${requestUrl}": `);
  const sentryBaggage = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
  const sentryBaggageHeader =
    sentryBaggage && sentryBaggage.length > 0 ? normalizeBaggageHeader(requestOptions, sentryBaggage) : undefined;

  requestOptions.headers = {
    ...requestOptions.headers,
    'sentry-trace': sentryTraceHeader,
    // Setting a header to `undefined` will crash in node so we only set the baggage header when it's defined
    ...(sentryBaggageHeader && { baggage: sentryBaggageHeader }),
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
