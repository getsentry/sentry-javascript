import type { Hub } from '@sentry/core';
import { spanContextToTraceparent } from '@sentry/core';
import type { EventProcessor, Integration, Span } from '@sentry/types';
import {
  dynamicRequire,
  dynamicSamplingContextToSentryBaggageHeader,
  getSanitizedUrlString,
  parseUrl,
  stringMatchesSomePattern,
} from '@sentry/utils';
import { LRUMap } from 'lru_map';

import type { NodeClient } from '../../client';
import { NODE_VERSION } from '../../nodeVersion';
import { isSentryRequest } from '../utils/http';
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
//   // @ts-ignore any
//   writeFileSync('log.out', `${format(...args)}\n`, { flag: 'a' });
// }

/**
 * Instruments outgoing HTTP requests made with the `undici` package via
 * Node's `diagnostics_channel` API.
 *
 * Supports Undici 4.7.0 or higher.
 *
 * Requires Node 16.17.0 or higher.
 */
export class Undici implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Undici';

  /**
   * @inheritDoc
   */
  public name: string = Undici.id;

  private readonly _options: UndiciOptions;

  private readonly _createSpanUrlMap: LRUMap<string, boolean> = new LRUMap(100);
  private readonly _headersUrlMap: LRUMap<string, boolean> = new LRUMap(100);

  public constructor(_options: Partial<UndiciOptions> = {}) {
    this._options = {
      breadcrumbs: _options.breadcrumbs === undefined ? true : _options.breadcrumbs,
      shouldCreateSpanForRequest: _options.shouldCreateSpanForRequest,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    // Requires Node 16+ to use the diagnostics_channel API.
    if (NODE_VERSION.major && NODE_VERSION.major < 16) {
      return;
    }

    let ds: DiagnosticsChannel | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ds = dynamicRequire(module, 'diagnostics_channel') as DiagnosticsChannel;
    } catch (e) {
      // no-op
    }

    if (!ds || !ds.subscribe) {
      return;
    }

    const shouldCreateSpan = (url: string): boolean => {
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
    };

    // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md
    ds.subscribe(ChannelName.RequestCreate, message => {
      const hub = getCurrentHub();
      if (!hub.getIntegration(Undici)) {
        return;
      }

      const { request } = message as RequestCreateMessage;

      const stringUrl = request.origin ? request.origin.toString() + request.path : request.path;

      if (isSentryRequest(stringUrl) || request.__sentry__ !== undefined) {
        return;
      }

      const client = hub.getClient<NodeClient>();
      const scope = hub.getScope();

      const parentSpan = scope.getSpan();

      if (client) {
        const clientOptions = client.getOptions();

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

        const span = shouldCreateSpan(stringUrl) ? createRequestSpan(request, stringUrl, parentSpan) : undefined;
        if (span) {
          request.__sentry__ = span;
        }

        if (shouldAttachTraceData(stringUrl)) {
          if (span) {
            request.addHeader('sentry-trace', span.toTraceparent());
            const dynamicSamplingContext = span.transaction?.getDynamicSamplingContext();
            const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
            if (sentryBaggageHeader) {
              request.addHeader('baggage', sentryBaggageHeader);
            }
          } else {
            const { traceId, sampled, dsc } = scope.getPropagationContext();
            request.addHeader('sentry-trace', spanContextToTraceparent(traceId, undefined, sampled));
            const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dsc);
            if (sentryBaggageHeader) {
              request.addHeader('baggage', sentryBaggageHeader);
            }
          }
        }
      }
    });

    ds.subscribe(ChannelName.RequestEnd, message => {
      const hub = getCurrentHub();
      if (!hub.getIntegration(Undici)) {
        return;
      }

      const { request, response } = message as RequestEndMessage;

      const stringUrl = request.origin ? request.origin.toString() + request.path : request.path;

      if (isSentryRequest(stringUrl)) {
        return;
      }

      const span = request.__sentry__;
      if (span) {
        span.setHttpStatus(response.statusCode);
        span.finish();
      }

      if (this._options.breadcrumbs) {
        hub.addBreadcrumb(
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
    });

    ds.subscribe(ChannelName.RequestError, message => {
      const hub = getCurrentHub();
      if (!hub.getIntegration(Undici)) {
        return;
      }

      const { request } = message as RequestErrorMessage;

      const stringUrl = request.origin ? request.origin.toString() + request.path : request.path;

      if (isSentryRequest(stringUrl)) {
        return;
      }

      const span = request.__sentry__;
      if (span) {
        span.setStatus('internal_error');
        span.finish();
      }

      if (this._options.breadcrumbs) {
        hub.addBreadcrumb(
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
    });
  }
}

/** */
function createRequestSpan(request: RequestWithSentry, stringUrl: string, parentSpan?: Span): Span | undefined {
  const url = parseUrl(stringUrl);
  const method = request.method || 'GET';
  const data: Record<string, unknown> = {
    'http.method': method,
  };
  if (url.search) {
    data['http.query'] = url.search;
  }
  if (url.hash) {
    data['http.fragment'] = url.hash;
  }
  const span = parentSpan?.startChild({
    op: 'http.client',
    description: `${method} ${getSanitizedUrlString(url)}`,
    data,
  });
  return span;
}
