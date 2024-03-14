import { addBreadcrumb, defineIntegration, getClient, instrumentFetchRequest, isSentryRequestUrl } from '@sentry/core';
import type {
  Client,
  FetchBreadcrumbData,
  FetchBreadcrumbHint,
  HandlerDataFetch,
  IntegrationFn,
  Span,
} from '@sentry/types';
import { LRUMap, addFetchInstrumentationHandler, stringMatchesSomePattern } from '@sentry/utils';

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

        instrumentFetchRequest(
          handlerData,
          _shouldCreateSpan,
          _shouldAttachTraceData,
          spans,
          'auto.http.wintercg_fetch',
        );

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

  if (handlerData.error) {
    const data = handlerData.fetchData;
    const hint: FetchBreadcrumbHint = {
      data: handlerData.error,
      input: handlerData.args,
      startTimestamp,
      endTimestamp,
    };

    addBreadcrumb(
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
    addBreadcrumb(
      {
        category: 'fetch',
        data,
        type: 'http',
      },
      hint,
    );
  }
}
