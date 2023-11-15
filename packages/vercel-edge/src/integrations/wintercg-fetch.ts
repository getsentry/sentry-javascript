import { instrumentFetchRequest } from '@sentry-internal/tracing';
import { getCurrentHub, isSentryRequestUrl } from '@sentry/core';
import type {
  EventProcessor,
  FetchBreadcrumbData,
  FetchBreadcrumbHint,
  HandlerDataFetch,
  Integration,
  Span,
} from '@sentry/types';
import { addInstrumentationHandler, LRUMap, stringMatchesSomePattern } from '@sentry/utils';

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
 * Creates spans and attaches tracing headers to fetch requests on WinterCG runtimes.
 */
export class WinterCGFetch implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'WinterCGFetch';

  /**
   * @inheritDoc
   */
  public name: string = WinterCGFetch.id;

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
      if (!hub.getIntegration(WinterCGFetch)) {
        return;
      }

      if (isSentryRequestUrl(handlerData.fetchData.url, hub)) {
        return;
      }

      instrumentFetchRequest(
        handlerData,
        this._shouldCreateSpan.bind(this),
        this._shouldAttachTraceData.bind(this),
        spans,
        'auto.http.wintercg_fetch',
      );

      if (this._options.breadcrumbs) {
        createBreadcrumb(handlerData);
      }
    });
  }

  /** TODO */
  private _shouldAttachTraceData(url: string): boolean {
    const hub = getCurrentHub();
    const client = hub.getClient();

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

function createBreadcrumb(handlerData: HandlerDataFetch): void {
  const { startTimestamp, endTimestamp } = handlerData;

  // We only capture complete fetch requests
  if (!endTimestamp) {
    return;
  }

  if (handlerData.error) {
    const data = handlerData.fetchData;
    const hint: FetchBreadcrumbHint = {
      data: handlerData.error,
      input: handlerData.args,
      startTimestamp,
      endTimestamp,
    };

    getCurrentHub().addBreadcrumb(
      {
        category: 'fetch',
        data,
        level: 'error',
        type: 'http',
      },
      hint,
    );
  } else {
    const data: FetchBreadcrumbData = {
      ...handlerData.fetchData,
      status_code: handlerData.response && handlerData.response.status,
    };
    const hint: FetchBreadcrumbHint = {
      input: handlerData.args,
      response: handlerData.response,
      startTimestamp,
      endTimestamp,
    };
    getCurrentHub().addBreadcrumb(
      {
        category: 'fetch',
        data,
        type: 'http',
      },
      hint,
    );
  }
}
