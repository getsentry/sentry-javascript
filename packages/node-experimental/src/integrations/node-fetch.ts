import type { Span } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { addBreadcrumb, defineIntegration, hasTracingEnabled } from '@sentry/core';
import { _INTERNAL, getClient, getSpanKind } from '@sentry/opentelemetry';
import type { Integration, IntegrationFn } from '@sentry/types';
import { parseSemver } from '@sentry/utils';

import type { NodeExperimentalClient } from '../types';
import { addOriginToSpan } from '../utils/addOriginToSpan';
import { NodePerformanceIntegration } from './NodePerformanceIntegration';

const NODE_VERSION: ReturnType<typeof parseSemver> = parseSemver(process.versions.node);

interface NodeFetchOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing fetch requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   */
  ignoreOutgoingRequests?: (url: string) => boolean;
}

const _nativeNodeFetchIntegration = ((options: NodeFetchOptions = {}) => {
  const _breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
  const _ignoreOutgoingRequests = options.ignoreOutgoingRequests;

  function getInstrumentation(): [Instrumentation] | void {
    // Only add NodeFetch if Node >= 16, as previous versions do not support it
    if (!NODE_VERSION.major || NODE_VERSION.major < 16) {
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FetchInstrumentation } = require('opentelemetry-instrumentation-fetch-node');
      return [
        new FetchInstrumentation({
          ignoreRequestHook: (request: { origin?: string }) => {
            const url = request.origin;
            return _ignoreOutgoingRequests && url && _ignoreOutgoingRequests(url);
          },

          onRequest: ({ span }: { span: Span }) => {
            _updateSpan(span);

            if (_breadcrumbs) {
              _addRequestBreadcrumb(span);
            }
          },
        }),
      ];
    } catch (error) {
      // Could not load instrumentation
    }
  }

  return {
    name: 'NodeFetch',
    setupOnce() {
      const instrumentations = getInstrumentation();

      if (instrumentations) {
        registerInstrumentations({
          instrumentations,
        });
      }
    },
  };
}) satisfies IntegrationFn;

export const nativeNodeFetchIntegration = defineIntegration(_nativeNodeFetchIntegration);

interface OldNodeFetchOptions {
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
 *
 * @deprecated Use `nativeNodeFetchIntegration()` instead.
 */
export class NodeFetch extends NodePerformanceIntegration<OldNodeFetchOptions> implements Integration {
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
  public constructor(options: OldNodeFetchOptions = {}) {
    super(options);

    // eslint-disable-next-line deprecation/deprecation
    this.name = NodeFetch.id;
    this._breadcrumbs = typeof options.breadcrumbs === 'undefined' ? true : options.breadcrumbs;
    this._spans = typeof options.spans === 'undefined' ? undefined : options.spans;

    // Properly set in setupOnce based on client settings
    this.shouldCreateSpansForRequests = false;
  }

  /** @inheritDoc */
  public setupInstrumentation(): void | Instrumentation[] {
    // Only add NodeFetch if Node >= 16, as previous versions do not support it
    if (!NODE_VERSION.major || NODE_VERSION.major < 16) {
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FetchInstrumentation } = require('opentelemetry-instrumentation-fetch-node');
      return [
        new FetchInstrumentation({
          onRequest: ({ span }: { span: Span }) => {
            _updateSpan(span);

            if (this._breadcrumbs) {
              _addRequestBreadcrumb(span);
            }
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
}

/** Update the span with data we need. */
function _updateSpan(span: Span): void {
  addOriginToSpan(span, 'auto.http.otel.node_fetch');
}

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(span: Span): void {
  if (getSpanKind(span) !== SpanKind.CLIENT) {
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
