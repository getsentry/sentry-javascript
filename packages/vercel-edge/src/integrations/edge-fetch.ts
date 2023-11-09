import { getCurrentHub, getDynamicSamplingContextFromClient, isSentryRequestUrl } from '@sentry/core';
import type { EventProcessor, HandlerDataFetch, Integration, Span } from '@sentry/types';
import {
  addInstrumentationHandler,
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  LRUMap,
  stringMatchesSomePattern,
} from '@sentry/utils';

import type { VercelEdgeClient } from '../client';

export interface Options {
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

/**
 * Instruments outgoing HTTP requests made with the `undici` package via
 * Node's `diagnostics_channel` API.
 *
 * Supports Undici 4.7.0 or higher.
 *
 * Requires Node 16.17.0 or higher.
 */
export class EdgeFetch implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'EdgeFetch';

  /**
   * @inheritDoc
   */
  public name: string = EdgeFetch.id;

  private readonly _options: Options;

  private readonly _createSpanUrlMap: LRUMap<string, boolean> = new LRUMap(100);
  private readonly _headersUrlMap: LRUMap<string, boolean> = new LRUMap(100);

  public constructor(_options: Partial<Options> = {}) {
    this._options = {
      breadcrumbs: _options.breadcrumbs === undefined ? true : _options.breadcrumbs,
      shouldCreateSpanForRequest: _options.shouldCreateSpanForRequest,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    const spans: Record<string, Span> = {};

    addInstrumentationHandler('fetch', (handlerData: HandlerDataFetch) => {
      const hub = getCurrentHub();
      if (!hub.getIntegration(EdgeFetch)) {
        return;
      }

      // TODO: Ignore if sentry request

      createFetchSpan(
        handlerData,
        this._shouldCreateSpan.bind(this),
        this._shouldAttachTraceData.bind(this),
        spans,
        'auto.http.vercel_edge',
      );

      // TODO: Breadcrumbs
    });
  }

  /** TODO */
  private _shouldAttachTraceData(url: string): boolean {
    const hub = getCurrentHub();
    const client = hub.getClient<VercelEdgeClient>();

    if (!client) {
      return false;
    }

    const clientOptions = client.getOptions();

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
  }

  /** Helper that wraps shouldCreateSpanForRequest option */
  private _shouldCreateSpan(url: string): boolean {
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
  }
}
