import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
import {
  dynamicRequire,
  dynamicSamplingContextToSentryBaggageHeader,
  parseSemver,
  stringMatchesSomePattern,
  stripUrlQueryAndFragment,
  dynamicRequire,
} from '@sentry/utils';

import type { NodeClient } from '../../client';
import { isSentryRequest } from '../utils/http';
import type { DiagnosticsChannel, RequestCreateMessage, RequestEndMessage, RequestErrorMessage } from './types';

const NODE_VERSION = parseSemver(process.versions.node);

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
}

const DEFAULT_UNDICI_OPTIONS: UndiciOptions = {
  breadcrumbs: true,
};

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

  public constructor(_options: Partial<UndiciOptions> = {}) {
    this._options = {
      ...DEFAULT_UNDICI_OPTIONS,
      ..._options,
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

    // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md
    ds.subscribe(ChannelName.RequestCreate, message => {
      const { request } = message as RequestCreateMessage;

      const url = new URL(request.path, request.origin);
      const stringUrl = url.toString();

      if (isSentryRequest(stringUrl)) {
        return;
      }

      const hub = getCurrentHub();
      const client = hub.getClient<NodeClient>();
      const scope = hub.getScope();

      const activeSpan = scope.getSpan();

      if (activeSpan && client) {
        const clientOptions = client.getOptions();

        // eslint-disable-next-line deprecation/deprecation
        const shouldCreateSpan = clientOptions.shouldCreateSpanForRequest
          ? // eslint-disable-next-line deprecation/deprecation
            clientOptions.shouldCreateSpanForRequest(stringUrl)
          : true;

        if (shouldCreateSpan) {
          const data: Record<string, unknown> = {};
          const params = url.searchParams.toString();
          if (params) {
            data['http.query'] = `?${params}`;
          }
          if (url.hash) {
            data['http.fragment'] = url.hash;
          }

          const span = activeSpan.startChild({
            op: 'http.client',
            description: `${request.method || 'GET'} ${stripUrlQueryAndFragment(stringUrl)}`,
            data,
          });
          request.__sentry__ = span;

          // eslint-disable-next-line deprecation/deprecation
          const shouldPropagate = clientOptions.tracePropagationTargets
            ? // eslint-disable-next-line deprecation/deprecation
              stringMatchesSomePattern(stringUrl, clientOptions.tracePropagationTargets)
            : true;

          if (shouldPropagate) {
            // TODO: Only do this based on tracePropagationTargets
            request.addHeader('sentry-trace', span.toTraceparent());
            if (span.transaction) {
              const dynamicSamplingContext = span.transaction.getDynamicSamplingContext();
              const sentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext);
              if (sentryBaggageHeader) {
                request.addHeader('baggage', sentryBaggageHeader);
              }
            }
          }
        }
      }
    });

    ds.subscribe(ChannelName.RequestEnd, message => {
      const { request, response } = message as RequestEndMessage;

      const url = new URL(request.path, request.origin);
      const stringUrl = url.toString();

      if (isSentryRequest(stringUrl)) {
        return;
      }

      const span = request.__sentry__;
      if (span) {
        span.setHttpStatus(response.statusCode);
        span.finish();
      }

      if (this._options.breadcrumbs) {
        getCurrentHub().addBreadcrumb(
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
      const { request } = message as RequestErrorMessage;

      const url = new URL(request.path, request.origin);
      const stringUrl = url.toString();

      if (isSentryRequest(stringUrl)) {
        return;
      }

      const span = request.__sentry__;
      if (span) {
        span.setStatus('internal_error');
        span.finish();
      }

      if (this._options.breadcrumbs) {
        getCurrentHub().addBreadcrumb(
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
