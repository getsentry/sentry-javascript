import type { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

import {
  addBreadcrumb,
  defineIntegration,
  getIsolationScope,
  hasTracingEnabled,
  isSentryRequestUrl,
} from '@sentry/core';
import { _INTERNAL, getClient, getSpanKind, setSpanMetadata } from '@sentry/opentelemetry';
import type { EventProcessor, Hub, Integration, IntegrationFn } from '@sentry/types';
import { stringMatchesSomePattern } from '@sentry/utils';

import { setIsolationScope } from '../sdk/scope';
import type { NodeExperimentalClient } from '../types';
import { addOriginToSpan } from '../utils/addOriginToSpan';
import { getRequestUrl } from '../utils/getRequestUrl';

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;

  /**
   * Do not capture spans or breadcrumbs for incoming HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreIncomingRequests?: (url: string) => boolean;
}

const _httpIntegration = ((options: HttpOptions = {}) => {
  const _breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
  const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;
  const _ignoreIncomingRequests = options.ignoreIncomingRequests;

  return {
    name: 'Http',
    setupOnce() {
      const instrumentations = [
        new HttpInstrumentation({
          ignoreOutgoingRequestHook: request => {
            const url = getRequestUrl(request);

            if (!url) {
              return false;
            }

            if (isSentryRequestUrl(url, getClient())) {
              return true;
            }

            if (_ignoreOutgoingRequests && _ignoreOutgoingRequests(url)) {
              return true;
            }

            return false;
          },

          ignoreIncomingRequestHook: request => {
            const url = getRequestUrl(request);

            const method = request.method?.toUpperCase();
            // We do not capture OPTIONS/HEAD requests as transactions
            if (method === 'OPTIONS' || method === 'HEAD') {
              return true;
            }

            if (_ignoreIncomingRequests && _ignoreIncomingRequests(url)) {
              return true;
            }

            return false;
          },

          requireParentforOutgoingSpans: true,
          requireParentforIncomingSpans: false,
          requestHook: (span, req) => {
            _updateSpan(span, req);

            // Update the isolation scope, isolate this request
            if (getSpanKind(span) === SpanKind.SERVER) {
              setIsolationScope(getIsolationScope().clone());
            }
          },
          responseHook: (span, res) => {
            if (_breadcrumbs) {
              _addRequestBreadcrumb(span, res);
            }
          },
        }),
      ];

      registerInstrumentations({
        instrumentations,
      });
    },
  };
}) satisfies IntegrationFn;

export const httpIntegration = defineIntegration(_httpIntegration);

interface OldHttpOptions {
  /**
   * Whether breadcrumbs should be recorded for requests
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Whether tracing spans should be created for requests
   * Defaults to false
   */
  spans?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs matching the given patterns.
   */
  ignoreOutgoingRequests?: (string | RegExp)[];
}

/**
 * Http instrumentation based on @opentelemetry/instrumentation-http.
 * This instrumentation does two things:
 * * Create breadcrumbs for outgoing requests
 * * Create spans for outgoing requests
 *
 * Note that this integration is also needed for the Express integration to work!
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
  public name: string;

  /**
   * If spans for HTTP requests should be captured.
   */
  public shouldCreateSpansForRequests: boolean;

  private _unload?: () => void;
  private readonly _breadcrumbs: boolean;
  // If this is undefined, use default behavior based on client settings
  private readonly _spans: boolean | undefined;
  private _ignoreOutgoingRequests: (string | RegExp)[];

  /**
   * @inheritDoc
   */
  public constructor(options: OldHttpOptions = {}) {
    // eslint-disable-next-line deprecation/deprecation
    this.name = Http.id;
    this._breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
    this._spans = typeof options.spans === 'undefined' ? undefined : options.spans;

    this._ignoreOutgoingRequests = options.ignoreOutgoingRequests || [];

    // Properly set in setupOnce based on client settings
    this.shouldCreateSpansForRequests = false;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    // No need to instrument if we don't want to track anything
    if (!this._breadcrumbs && this._spans === false) {
      return;
    }

    const client = getClient<NodeExperimentalClient>();
    const clientOptions = client?.getOptions();

    // This is used in the sampler function
    this.shouldCreateSpansForRequests =
      typeof this._spans === 'boolean' ? this._spans : hasTracingEnabled(clientOptions);

    // Register instrumentations we care about
    this._unload = registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          ignoreOutgoingRequestHook: request => {
            const url = getRequestUrl(request);

            if (!url) {
              return false;
            }

            if (isSentryRequestUrl(url, getClient())) {
              return true;
            }

            if (this._ignoreOutgoingRequests.length && stringMatchesSomePattern(url, this._ignoreOutgoingRequests)) {
              return true;
            }

            return false;
          },

          ignoreIncomingRequestHook: request => {
            const method = request.method?.toUpperCase();
            // We do not capture OPTIONS/HEAD requests as transactions
            if (method === 'OPTIONS' || method === 'HEAD') {
              return true;
            }

            return false;
          },

          requireParentforOutgoingSpans: true,
          requireParentforIncomingSpans: false,
          requestHook: (span, req) => {
            _updateSpan(span, req);

            // Update the isolation scope, isolate this request
            if (getSpanKind(span) === SpanKind.SERVER) {
              setIsolationScope(getIsolationScope().clone());
            }
          },
          responseHook: (span, res) => {
            if (this._breadcrumbs) {
              _addRequestBreadcrumb(span, res);
            }
          },
        }),
      ],
    });
  }

  /**
   *  Unregister this integration.
   */
  public unregister(): void {
    this._unload?.();
  }
}

/** Update the span with data we need. */
function _updateSpan(span: Span, request: ClientRequest | IncomingMessage): void {
  addOriginToSpan(span, 'auto.http.otel.http');

  if (getSpanKind(span) === SpanKind.SERVER) {
    setSpanMetadata(span, { request });
  }
}

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(span: Span, response: IncomingMessage | ServerResponse): void {
  if (getSpanKind(span) !== SpanKind.CLIENT) {
    return;
  }

  const data = _INTERNAL.getRequestSpanData(span);
  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: response.statusCode,
        ...data,
      },
      type: 'http',
    },
    {
      event: 'response',
      // TODO FN: Do we need access to `request` here?
      // If we do, we'll have to use the `applyCustomAttributesOnSpan` hook instead,
      // but this has worse context semantics than request/responseHook.
      response,
    },
  );
}
