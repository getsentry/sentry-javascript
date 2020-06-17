import { getCurrentHub } from '@sentry/core';
import { Integration, Span, Transaction } from '@sentry/types';
import { fill, parseSemver } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';

const NODE_VERSION = parseSemver(process.versions.node);

/** http module integration */
export class Http implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Http.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'Http';

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
  public setupOnce(): void {
    // No need to instrument if we don't want to track anything
    if (!this._breadcrumbs && !this._tracing) {
      return;
    }

    const handlerWrapper = createHandlerWrapper(this._breadcrumbs, this._tracing);

    const httpModule = require('http');
    fill(httpModule, 'get', handlerWrapper);
    fill(httpModule, 'request', handlerWrapper);

    // NOTE: Prior to Node 9, `https` used internals of `http` module, thus we don't patch it.
    // If we do, we'd get double breadcrumbs and double spans for `https` calls.
    // It has been changed in Node 9, so for all versions equal and above, we patch `https` separately.
    if (NODE_VERSION.major && NODE_VERSION.major > 8) {
      const httpsModule = require('https');
      fill(httpsModule, 'get', handlerWrapper);
      fill(httpsModule, 'request', handlerWrapper);
    }
  }
}

/**
 * Wrapper function for internal `request` and `get` calls within `http` and `https` modules
 */
function createHandlerWrapper(
  breadcrumbsEnabled: boolean,
  tracingEnabled: boolean,
): (originalHandler: () => http.ClientRequest) => (options: string | http.ClientRequestArgs) => http.ClientRequest {
  return function handlerWrapper(
    originalHandler: () => http.ClientRequest,
  ): (options: string | http.ClientRequestArgs) => http.ClientRequest {
    return function(this: typeof http | typeof https, options: string | http.ClientRequestArgs): http.ClientRequest {
      const requestUrl = extractUrl(options);

      if (isSentryRequest(requestUrl)) {
        return originalHandler.apply(this, arguments);
      }

      let span: Span | undefined;
      let transaction: Transaction | undefined;

      const scope = getCurrentHub().getScope();
      if (scope && tracingEnabled) {
        transaction = scope.getTransaction();
        if (transaction) {
          span = transaction.startChild({
            description: `${typeof options === 'string' || !options.method ? 'GET' : options.method} ${requestUrl}`,
            op: 'request',
          });
        }
      }

      return originalHandler
        .apply(this, arguments)
        .once('response', function(this: http.IncomingMessage, res: http.ServerResponse): void {
          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('response', requestUrl, this, res);
          }
          if (tracingEnabled && span) {
            span.setHttpStatus(res.statusCode);
            span.finish();
          }
        })
        .once('error', function(this: http.IncomingMessage): void {
          if (breadcrumbsEnabled) {
            addRequestBreadcrumb('error', requestUrl, this);
          }
          if (tracingEnabled && span) {
            span.setHttpStatus(500);
            span.finish();
          }
        });
    };
  };
}

/**
 * Captures Breadcrumb based on provided request/response pair
 */
function addRequestBreadcrumb(event: string, url: string, req: http.IncomingMessage, res?: http.ServerResponse): void {
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

/**
 * Function that can combine together a url that'll be used for our breadcrumbs.
 *
 * @param options url that should be returned or an object containing it's parts.
 * @returns constructed url
 */
function extractUrl(options: string | http.ClientRequestArgs): string {
  if (typeof options === 'string') {
    return options;
  }
  const protocol = options.protocol || '';
  const hostname = options.hostname || options.host || '';
  // Don't log standard :80 (http) and :443 (https) ports to reduce the noise
  const port = !options.port || options.port === 80 || options.port === 443 ? '' : `:${options.port}`;
  const path = options.path || '/';
  return `${protocol}//${hostname}${port}${path}`;
}

/**
 * Checks whether given url points to Sentry server
 * @param url url to verify
 */
function isSentryRequest(url: string): boolean {
  const client = getCurrentHub().getClient();
  if (!url || !client) {
    return false;
  }

  const dsn = client.getDsn();
  if (!dsn) {
    return false;
  }

  return url.indexOf(dsn.host) !== -1;
}
