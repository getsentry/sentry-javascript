import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { addBreadcrumb, hasTracingEnabled } from '@sentry/core';
import { _INTERNAL, getClient, getSpanKind } from '@sentry/opentelemetry';
import type { Integration } from '@sentry/types';

import type { NodeExperimentalClient } from '../types';
import { addOriginToSpan } from '../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

interface NodeFetchOptions {
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
}

/**
 * Fetch instrumentation based on opentelemetry-instrumentation-fetch.
 * This instrumentation does two things:
 * * Create breadcrumbs for outgoing requests
 * * Create spans for outgoing requests
 */
export class NodeFetch extends NodePerformanceIntegration<NodeFetchOptions> implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'NodeFetch';

  /**
   * @inheritDoc
   */
  public name: string;

  /**
   * If spans for HTTP requests should be captured.
   */
  public shouldCreateSpansForRequests: boolean;

  private readonly _breadcrumbs: boolean;
  // If this is undefined, use default behavior based on client settings
  private readonly _spans: boolean | undefined;

  /**
   * @inheritDoc
   */
  public constructor(options: NodeFetchOptions = {}) {
    super(options);

    this.name = NodeFetch.id;
    this._breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
    this._spans = typeof options.spans === 'undefined' ? undefined : options.spans;

    // Properly set in setupOnce based on client settings
    this.shouldCreateSpansForRequests = false;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FetchInstrumentation } = require('opentelemetry-instrumentation-fetch-node');
      return [
        new FetchInstrumentation({
          onRequest: ({ span }: { span: Span }) => {
            this._updateSpan(span);
            this._addRequestBreadcrumb(span);
          },
        }),
      ];
    } catch (error) {
      // Could not load instrumentation
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    super.setupOnce();

    const client = getClient<NodeExperimentalClient>();
    const clientOptions = client?.getOptions();

    // This is used in the sampler function
    this.shouldCreateSpansForRequests =
      typeof this._spans === 'boolean' ? this._spans : hasTracingEnabled(clientOptions);
  }

  /**
   *  Unregister this integration.
   */
  public unregister(): void {
    this._unload?.();
  }

  /** Update the span with data we need. */
  private _updateSpan(span: Span): void {
    addOriginToSpan(span, 'auto.http.otel.node_fetch');
  }

  /** Add a breadcrumb for outgoing requests. */
  private _addRequestBreadcrumb(span: Span): void {
    if (!this._breadcrumbs || getSpanKind(span) !== SpanKind.CLIENT) {
      return;
    }

    const data = _INTERNAL.getRequestSpanData(span);
    addBreadcrumb({
      category: 'http',
      data: {
        ...data,
      },
      type: 'http',
    });
  }
}
