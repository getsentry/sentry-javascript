import type { Hub, Span } from '@sentry/core';
import { stripUrlQueryAndFragment } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
import { dynamicSamplingContextToSentryBaggageHeader, stringMatchesSomePattern } from '@sentry/utils';
import type DiagnosticsChannel from 'diagnostics_channel';

import type { NodeClient } from '../client';
import { isSentryRequest } from './utils/http';

enum ChannelName {
  // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md#undicirequestcreate
  RequestCreate = 'undici:request:create',
  RequestEnd = 'undici:request:headers',
  RequestError = 'undici:request:error',
}

interface RequestWithSentry extends DiagnosticsChannel.Request {
  __sentry__?: Span;
}

interface RequestCreateMessage {
  request: RequestWithSentry;
}

interface RequestEndMessage {
  request: RequestWithSentry;
  response: DiagnosticsChannel.Response;
}

interface RequestErrorMessage {
  request: RequestWithSentry;
  error: Error;
}

interface UndiciOptions {
  /**
   * Whether breadcrumbs should be recorded for requests
   * Defaults to true
   */
  breadcrumbs: boolean;
}

const DEFAULT_UNDICI_OPTIONS: UndiciOptions = {
  breadcrumbs: true,
};

/** */
export class Undici implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Undici';

  /**
   * @inheritDoc
   */
  public name: string = Undici.id;

  // Have to hold all built channels in memory otherwise they get garbage collected
  // See: https://github.com/nodejs/node/pull/42714
  // This has been fixed in Node 19+
  private _channels = new Set<DiagnosticsChannel.Channel>();

  private readonly _options: UndiciOptions;

  public constructor(_options: UndiciOptions) {
    this._options = {
      ...DEFAULT_UNDICI_OPTIONS,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    let ds: typeof DiagnosticsChannel | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ds = require('diagnostics_channel') as typeof DiagnosticsChannel;
    } catch (e) {
      // no-op
    }

    if (!ds) {
      return;
    }

    // https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/docs/api/DiagnosticsChannel.md
    const requestCreateChannel = this._setupChannel(ds, ChannelName.RequestCreate);
    requestCreateChannel.subscribe(message => {
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
        const options = client.getOptions();

        // eslint-disable-next-line deprecation/deprecation
        const shouldCreateSpan = options.shouldCreateSpanForRequest
          ? // eslint-disable-next-line deprecation/deprecation
            options.shouldCreateSpanForRequest(stringUrl)
          : true;

        if (shouldCreateSpan) {
          const span = activeSpan.startChild({
            op: 'http.client',
            description: `${request.method || 'GET'} ${stripUrlQueryAndFragment(stringUrl)}`,
            data: {
              'http.query': `?${url.searchParams.toString()}`,
              'http.fragment': url.hash,
            },
          });
          request.__sentry__ = span;

          // eslint-disable-next-line deprecation/deprecation
          const shouldPropagate = options.tracePropagationTargets
            ? // eslint-disable-next-line deprecation/deprecation
              stringMatchesSomePattern(stringUrl, options.tracePropagationTargets)
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

    const requestEndChannel = this._setupChannel(ds, ChannelName.RequestEnd);
    requestEndChannel.subscribe(message => {
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

    const requestErrorChannel = this._setupChannel(ds, ChannelName.RequestError);
    requestErrorChannel.subscribe(message => {
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

  /** */
  private _setupChannel(
    ds: typeof DiagnosticsChannel,
    name: Parameters<typeof DiagnosticsChannel.channel>[0],
  ): DiagnosticsChannel.Channel {
    const channel = ds.channel(name);
    this._channels.add(channel);
    return channel;
  }
}
