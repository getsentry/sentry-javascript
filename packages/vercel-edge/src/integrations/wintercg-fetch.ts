import type {
  Client,
  FetchBreadcrumbData,
  FetchBreadcrumbHint,
  HandlerDataFetch,
  IntegrationFn,
  Span,
} from '@sentry/core';
import {
  addBreadcrumb,
  addFetchInstrumentationHandler,
  defineIntegration,
  getBreadcrumbLogLevelFromHttpStatusCode,
  getClient,
  instrumentFetchRequest,
  isSentryRequestUrl,
  LRUMap,
  stringMatchesSomePattern,
} from '@sentry/core';

const INTEGRATION_NAME = 'WinterCGFetch';

const HAS_CLIENT_MAP = new WeakMap<Client, boolean>();

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

const _winterCGFetch = ((options: Partial<Options> = {}) => {
  const breadcrumbs = options.breadcrumbs === undefined ? true : options.breadcrumbs;
  const shouldCreateSpanForRequest = options.shouldCreateSpanForRequest;

  const _createSpanUrlMap = new LRUMap<string, boolean>(100);
  const _headersUrlMap = new LRUMap<string, boolean>(100);

  const spans: Record<string, Span> = {};

  /** Decides whether to attach trace data to the outgoing fetch request */
  function _shouldAttachTraceData(url: string): boolean {
    const client = getClient();

    if (!client) {
      return false;
    }

    const clientOptions = client.getOptions();

    if (clientOptions.tracePropagationTargets === undefined) {
      return true;
    }

    const cachedDecision = _headersUrlMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = stringMatchesSomePattern(url, clientOptions.tracePropagationTargets);
    _headersUrlMap.set(url, decision);
    return decision;
  }

  /** Helper that wraps shouldCreateSpanForRequest option */
  function _shouldCreateSpan(url: string): boolean {
    if (shouldCreateSpanForRequest === undefined) {
      return true;
    }

    const cachedDecision = _createSpanUrlMap.get(url);
    if (cachedDecision !== undefined) {
      return cachedDecision;
    }

    const decision = shouldCreateSpanForRequest(url);
    _createSpanUrlMap.set(url, decision);
    return decision;
  }

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      addFetchInstrumentationHandler(handlerData => {
        const client = getClient();
        if (!client || !HAS_CLIENT_MAP.get(client)) {
          return;
        }

        if (isSentryRequestUrl(handlerData.fetchData.url, client)) {
          return;
        }

        instrumentFetchRequest(handlerData, _shouldCreateSpan, _shouldAttachTraceData, spans, {
          spanOrigin: 'auto.http.wintercg_fetch',
        });

        if (breadcrumbs) {
          createBreadcrumb(handlerData);
        }
      });
    },
    setup(client) {
      HAS_CLIENT_MAP.set(client, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Creates spans and attaches tracing headers to fetch requests on WinterCG runtimes.
 */
export const winterCGFetchIntegration = defineIntegration(_winterCGFetch);

function createBreadcrumb(handlerData: HandlerDataFetch): void {
  const { startTimestamp, endTimestamp } = handlerData;

  // We only capture complete fetch requests
  if (!endTimestamp) {
    return;
  }

  const breadcrumbData: FetchBreadcrumbData = {
    method: handlerData.fetchData.method,
    url: handlerData.fetchData.url,
  };

  if (handlerData.error) {
    const hint: FetchBreadcrumbHint = {
      data: handlerData.error,
      input: handlerData.args,
      startTimestamp,
      endTimestamp,
    };

    addBreadcrumb(
      {
        category: 'fetch',
        data: breadcrumbData,
        level: 'error',
        type: 'http',
      },
      hint,
    );
  } else {
    const response = handlerData.response as Response | undefined;

    breadcrumbData.request_body_size = handlerData.fetchData.request_body_size;
    breadcrumbData.response_body_size = handlerData.fetchData.response_body_size;
    breadcrumbData.status_code = response?.status;

    const hint: FetchBreadcrumbHint = {
      input: handlerData.args,
      response,
      startTimestamp,
      endTimestamp,
    };
    const level = getBreadcrumbLogLevelFromHttpStatusCode(breadcrumbData.status_code);

    addBreadcrumb(
      {
        category: 'fetch',
        data: breadcrumbData,
        type: 'http',
        level,
      },
      hint,
    );
  }
}
