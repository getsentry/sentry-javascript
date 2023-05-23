import type { Hub } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import type { EventProcessor, Integration, SanitizedRequestData, Span, TracePropagationTargets } from '@sentry/types';
import { dynamicSamplingContextToSentryBaggageHeader, fill, logger, stringMatchesSomePattern } from '@sentry/utils';
import type * as http from 'http';
import type * as https from 'https';
import { LRUMap } from 'lru_map';

import type { NodeClient } from '../client';
import { NODE_VERSION } from '../nodeVersion';
import type { RequestMethod, RequestMethodArgs } from './utils/http';
import { cleanSpanDescription, extractRawUrl, extractUrl, isSentryRequest, normalizeRequestArgs } from './utils/http';

interface TracingOptions {
  /**
   * List of strings/regex controlling to which outgoing requests
   * the SDK will attach tracing headers.
   *
   * By default the SDK will attach those headers to all outgoing
   * requests. If this option is provided, the SDK will match the
   * request URL of outgoing requests against the items in this
   * array, and only attach tracing headers if a match was found.
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
      __DEBUG_BUILD__ && logger.log('HTTP Integration is skipped because of instrumenter configuration.');
      return;
    }

    // TODO (v8): `tracePropagationTargets` and `shouldCreateSpanForRequest` will be removed from clientOptions
    // and we will no longer have to do this optional merge, we can just pass `this._tracing` directly.
    const tracingOptions = this._tracing ? { ...clientOptions, ...this._tracing } : undefined;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const httpModule = require('http');
    const wrappedHttpHandlerMaker = _createWrappedRequestMethodFactory(this._breadcrumbs, tracingOptions, httpModule);
    fill(httpModule, 'get', wrappedHttpHandlerMaker);
    fill(httpModule, 'request', wrappedHttpHandlerMaker);

    // NOTE: Prior to Node 9, `https` used internals of `http` module, thus we don't patch it.
    // If we do, we'd get double breadcrumbs and double spans for `https` calls.
    // It has been changed in Node 9, so for all versions equal and above, we patch `https` separately.
    if (NODE_VERSION.major && NODE_VERSION.major > 8) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const httpsModule = require('https');
      const wrappedHttpsHandlerMaker = _createWrappedRequestMethodFactory(
        this._breadcrumbs,
        tracingOptions,
        httpsModule,
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
  breadcrumbsEnabled: boolean,
  tracingOptions: TracingOptions | undefined,
  httpModule: typeof http | typeof https,
): WrappedRequestMethodFactory {
  // We're caching results so we don't have to recompute regexp every time we create a request.
  const createSpanUrlMap = new LRUMap<string, boolean>(100);
  const headersUrlMap = new LRUMap<string, boolean>(100);

  const shouldCreateSpan = (url: string): boolean => {
    if (tracingOptions?.shouldCreateSpanForRequest === undefined) {
      return true;
    }

    const cachedDecision = createSpanUrlMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = tracingOptions.shouldCreateSpanForRequest(url);
    createSpanUrlMap.set(url, decision);
    return decision;
  };

  const shouldAttachTraceData = (url: string): boolean => {
    if (tracingOptions?.tracePropagationTargets === undefined) {
      return true;
    }

    const cachedDecision = headersUrlMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = stringMatchesSomePattern(url, tracingOptions.tracePropagationTargets);
    headersUrlMap.set(url, decision);
    return decision;
  };

  return function wrappedRequestMethodFactory(originalRequestMethod: OriginalRequestMethod): WrappedRequestMethod {
    return function wrappedMethod(this: unknown, ...args: RequestMethodArgs): http.ClientRequest {
      const requestArgs = normalizeRequestArgs(httpModule, args);
      const requestOptions = requestArgs[0];
      // eslint-disable-next-line deprecation/deprecation
      const rawRequestUrl = extractRawUrl(requestOptions);
      const requestUrl = extractUrl(requestOptions);

      // we don't want to record requests to Sentry as either breadcrumbs or spans, so just use the original method
      if (isSentryRequest(requestUrl)) {
        return originalRequestMethod.apply(httpModule, requestArgs);
      }

      let requestSpan: Span | undefined;
      let parentSpan: Span | undefined;

      const scope = getCurrentHub().getScope();

      const method = requestOptions.method || 'GET';
      const requestSpanData: SanitizedRequestData = {
        url: requestUrl,
        'http.method': method,
      };
      if (requestOptions.hash) {
        // strip leading "#"
        requestSpanData['http.fragment'] = requestOptions.hash.substring(1);
      }
      if (requestOptions.search) {
        // strip leading "?"
        requestSpanData['http.query'] = requestOptions.search.substring(1);
      }

      if (scope && tracingOptions && shouldCreateSpan(rawRequestUrl)) {
        parentSpan = scope.getSpan();

        if (parentSpan) {
          requestSpan = parentSpan.startChild({
            description: `${method} ${requestSpanData.url}`,
            op: 'http.client',
            data: requestSpanData,
          });

          if (shouldAttachTraceData(rawRequestUrl)) {
            const sentryTraceHeader = requestSpan.toTraceparent();
            __DEBUG_BUILD__ &&
              logger.log(
                `[Tracing] Adding sentry-trace header ${sentryTraceHeader} to outgoing request to "${requestUrl}": `,
              );

            requestOptions.headers = {
              ...requestOptions.headers,
              'sentry-trace': sentryTraceHeader,
            };

            if (parentSpan.transaction) {
              const dynamicSamplingContext = parentSpan.transaction.getDynamicSamplingContext();
              const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);

              let newBaggageHeaderField;
              if (!requestOptions.headers || !requestOptions.headers.baggage) {
                newBaggageHeaderField = sentryBaggageHeader;
              } else if (!sentryBaggageHeader) {
                newBaggageHeaderField = requestOptions.headers.baggage;
              } else if (Array.isArray(requestOptions.headers.baggage)) {
                newBaggageHeaderField = [...requestOptions.headers.baggage, sentryBaggageHeader];
              } else {
                // Type-cast explanation:
                // Technically this the following could be of type `(number | string)[]` but for the sake of simplicity
                // we say this is undefined behaviour, since it would not be baggage spec conform if the user did this.
                newBaggageHeaderField = [requestOptions.headers.baggage, sentryBaggageHeader] as string[];
              }

              requestOptions.headers = {
                ...requestOptions.headers,
                // Setting a hader to `undefined` will crash in node so we only set the baggage header when it's defined
                ...(newBaggageHeaderField && { baggage: newBaggageHeaderField }),
              };
            }
          } else {
            __DEBUG_BUILD__ &&
              logger.log(
                `[Tracing] Not adding sentry-trace header to outgoing request (${requestUrl}) due to mismatching tracePropagationTargets option.`,
              );
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return originalRequestMethod
        .apply(httpModule, requestArgs)
        .once('response', function (this: http.ClientRequest, res: http.IncomingMessage): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;
          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('response', requestSpanData, req, res);
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
            addRequestBreadcrumb('error', requestSpanData, req);
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
