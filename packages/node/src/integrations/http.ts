import { getCurrentHub, Hub } from '@sentry/core';
import { EventProcessor, Integration, Span, TracePropagationTargets } from '@sentry/types';
import { fill, isMatchingPattern, logger, mergeAndSerializeBaggage, parseSemver } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';

import { NodeClientOptions } from '../types';
import {
  cleanSpanDescription,
  extractUrl,
  isSentryRequest,
  normalizeRequestArgs,
  RequestMethod,
  RequestMethodArgs,
} from './utils/http';

const NODE_VERSION = parseSemver(process.versions.node);

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

  /**
   * @inheritDoc
   */
  private readonly _breadcrumbs: boolean;

  /**
   * @inheritDoc
   */
  private readonly _tracing: boolean;

  /**
   * @inheritDoc
   */
  public constructor(options: { breadcrumbs?: boolean; tracing?: boolean } = {}) {
    this._breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
    this._tracing = typeof options.tracing === 'undefined' ? false : options.tracing;
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

    const clientOptions = setupOnceGetCurrentHub().getClient()?.getOptions() as NodeClientOptions | undefined;

    const wrappedHandlerMaker = _createWrappedRequestMethodFactory(
      this._breadcrumbs,
      this._tracing,
      clientOptions?.tracePropagationTargets,
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const httpModule = require('http');
    fill(httpModule, 'get', wrappedHandlerMaker);
    fill(httpModule, 'request', wrappedHandlerMaker);

    // NOTE: Prior to Node 9, `https` used internals of `http` module, thus we don't patch it.
    // If we do, we'd get double breadcrumbs and double spans for `https` calls.
    // It has been changed in Node 9, so for all versions equal and above, we patch `https` separately.
    if (NODE_VERSION.major && NODE_VERSION.major > 8) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const httpsModule = require('https');
      fill(httpsModule, 'get', wrappedHandlerMaker);
      fill(httpsModule, 'request', wrappedHandlerMaker);
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
  tracingEnabled: boolean,
  tracePropagationTargets: TracePropagationTargets | undefined,
): WrappedRequestMethodFactory {
  // We're caching results so we dont have to recompute regexp everytime we create a request.
  const urlMap: Record<string, boolean> = {};
  const shouldAttachTraceData = (url: string): boolean => {
    if (tracePropagationTargets === undefined) {
      return true;
    }

    if (urlMap[url]) {
      return urlMap[url];
    }

    urlMap[url] = tracePropagationTargets.some(tracePropagationTarget =>
      isMatchingPattern(url, tracePropagationTarget),
    );

    return urlMap[url];
  };

  return function wrappedRequestMethodFactory(originalRequestMethod: OriginalRequestMethod): WrappedRequestMethod {
    return function wrappedMethod(this: typeof http | typeof https, ...args: RequestMethodArgs): http.ClientRequest {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const httpModule = this;

      const requestArgs = normalizeRequestArgs(this, args);
      const requestOptions = requestArgs[0];
      const requestUrl = extractUrl(requestOptions);

      // we don't want to record requests to Sentry as either breadcrumbs or spans, so just use the original method
      if (isSentryRequest(requestUrl)) {
        return originalRequestMethod.apply(httpModule, requestArgs);
      }

      let span: Span | undefined;
      let parentSpan: Span | undefined;

      const scope = getCurrentHub().getScope();

      if (scope && tracingEnabled) {
        parentSpan = scope.getSpan();

        if (parentSpan) {
          span = parentSpan.startChild({
            description: `${requestOptions.method || 'GET'} ${requestUrl}`,
            op: 'http.client',
          });

          if (shouldAttachTraceData(requestUrl)) {
            const sentryTraceHeader = span.toTraceparent();
            __DEBUG_BUILD__ &&
              logger.log(
                `[Tracing] Adding sentry-trace header ${sentryTraceHeader} to outgoing request to "${requestUrl}": `,
              );

            const baggage = parentSpan.transaction && parentSpan.transaction.getBaggage();
            const headerBaggageString = requestOptions.headers && requestOptions.headers.baggage;

            requestOptions.headers = {
              ...requestOptions.headers,
              'sentry-trace': sentryTraceHeader,
              baggage: mergeAndSerializeBaggage(baggage, headerBaggageString),
            };
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
            addRequestBreadcrumb('response', requestUrl, req, res);
          }
          if (tracingEnabled && span) {
            const transaction = span.transaction;
            if (transaction) {
              transaction.metadata.propagations += 1;
            }

            if (res.statusCode) {
              span.setHttpStatus(res.statusCode);
            }
            span.description = cleanSpanDescription(span.description, requestOptions, req);
            span.finish();
          }
        })
        .once('error', function (this: http.ClientRequest): void {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const req = this;

          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('error', requestUrl, req);
          }
          if (tracingEnabled && span) {
            span.setHttpStatus(500);
            span.description = cleanSpanDescription(span.description, requestOptions, req);
            span.finish();
          }
        });
    };
  };
}

/**
 * Captures Breadcrumb based on provided request/response pair
 */
function addRequestBreadcrumb(event: string, url: string, req: http.ClientRequest, res?: http.IncomingMessage): void {
  if (!getCurrentHub().getIntegration(Http)) {
    return;
  }

  getCurrentHub().addBreadcrumb(
    {
      category: 'http',
      data: {
        method: req.method,
        status_code: res && res.statusCode,
        url,
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
