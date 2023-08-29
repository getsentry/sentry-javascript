import type { Attributes } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import type { Span as OtelSpan } from '@opentelemetry/sdk-trace-node';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { hasTracingEnabled } from '@sentry/core';
import { getCurrentHub } from '@sentry/node';
import type { AdditionalOtelSpanData } from '@sentry/opentelemetry-node';
import { addOtelSpanData } from '@sentry/opentelemetry-node';
import type { EventProcessor, Hub, Integration } from '@sentry/types';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'http';

import type { NodeExperimentalClient } from '../sdk/client';
import { getRequestSpanData } from '../utils/getRequestSpanData';

interface TracingOptions {
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
 * Http instrumentation based on @opentelemetry/instrumentation-http.
 * This instrumentation does two things:
 * * Create breadcrumbs for outgoing requests
 * * Create spans for outgoing requests
 *
 * Note that this integration is also needed for the Express integration to work!
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

  private _unload?: () => void;
  private readonly _breadcrumbs: boolean;
  // undefined: default behavior based on tracing settings
  private readonly _tracing: boolean | undefined;
  private _shouldCreateSpans: boolean;
  private _shouldCreateSpanForRequest?: (url: string) => boolean;

  /**
   * @inheritDoc
   */
  public constructor(options: HttpOptions = {}) {
    this.name = Http.id;
    this._breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
    this._tracing = typeof options.tracing === 'undefined' ? undefined : !!options.tracing;
    this._shouldCreateSpans = false;

    if (options.tracing && typeof options.tracing === 'object') {
      this._shouldCreateSpanForRequest = options.tracing.shouldCreateSpanForRequest;
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    // No need to instrument if we don't want to track anything
    if (!this._breadcrumbs && this._tracing === false) {
      return;
    }

    const client = getCurrentHub().getClient<NodeExperimentalClient>();
    const clientOptions = client?.getOptions();

    this._shouldCreateSpans = typeof this._tracing === 'undefined' ? hasTracingEnabled(clientOptions) : this._tracing;

    // Register instrumentations we care about
    this._unload = registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          requireParentforOutgoingSpans: true,
          requireParentforIncomingSpans: false,
          applyCustomAttributesOnSpan: (span, req, res) => {
            this._onSpan(span as unknown as OtelSpan, req, res);
          },
        }),
      ],
    });

    this._shouldCreateSpanForRequest =
      // eslint-disable-next-line deprecation/deprecation
      this._shouldCreateSpanForRequest || clientOptions?.shouldCreateSpanForRequest;

    client?.on?.('otelSpanEnd', this._onSpanEnd);
  }

  /**
   *  Unregister this integration.
   */
  public unregister(): void {
    this._unload?.();
  }

  private _onSpanEnd: (otelSpan: unknown, mutableOptions: { drop: boolean }) => void = (
    otelSpan: unknown,
    mutableOptions: { drop: boolean },
  ) => {
    if (!this._shouldCreateSpans) {
      mutableOptions.drop = true;
      return;
    }

    if (this._shouldCreateSpanForRequest) {
      const url = getHttpUrl((otelSpan as OtelSpan).attributes);
      if (url && !this._shouldCreateSpanForRequest(url)) {
        mutableOptions.drop = true;
        return;
      }
    }

    return;
  };

  /** Handle an emitted span from the HTTP instrumentation. */
  private _onSpan(
    span: OtelSpan,
    request: ClientRequest | IncomingMessage,
    response: IncomingMessage | ServerResponse,
  ): void {
    const data = getRequestSpanData(span, request, response);
    const { attributes } = span;

    const additionalData: AdditionalOtelSpanData = {
      tags: {},
      data: {
        url: data.url,
      },
      contexts: {},
      metadata: {},
      origin: 'auto.http.otel-http',
    };

    if (span.kind === SpanKind.SERVER) {
      additionalData.metadata = { request };
    }

    if (attributes[SemanticAttributes.HTTP_STATUS_CODE]) {
      const statusCode = attributes[SemanticAttributes.HTTP_STATUS_CODE] as string;
      additionalData.tags['http.status_code'] = statusCode;
      additionalData.data['http.response.status_code'] = statusCode;
    }

    if (data['http.query']) {
      additionalData.data['http.query'] = data['http.query'].slice(1);
    }
    if (data['http.fragment']) {
      additionalData.data['http.fragment'] = data['http.fragment'].slice(1);
    }

    addOtelSpanData(span.spanContext().spanId, additionalData);

    if (this._breadcrumbs) {
      getCurrentHub().addBreadcrumb(
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
          request,
          response,
        },
      );
    }
  }
}

function getHttpUrl(attributes: Attributes): string | undefined {
  const url = attributes[SemanticAttributes.HTTP_URL];
  return typeof url === 'string' ? url : undefined;
}
