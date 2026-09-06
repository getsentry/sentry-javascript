import type { Client, IntegrationFn, Span } from '@sentry/core';
import {
  addFetchInstrumentationHandler,
  defineIntegration,
  getClient,
  instrumentFetchRequest,
  isSentryRequestUrl,
  LRUMap,
  shouldPropagateTraceForUrl,
} from '@sentry/core';

const INTEGRATION_NAME = 'Fetch' as const;

const HAS_CLIENT_MAP = new WeakMap<Client, boolean>();

interface FetchOptions {
  /**
   * Function determining whether or not to create spans to track outgoing requests to the given URL.
   * By default, spans will be created for all outgoing requests.
   */
  shouldCreateSpanForRequest?: (url: string) => boolean;
}

const _fetchIntegration = ((options: FetchOptions = {}) => {
  const shouldCreateSpanForRequest = options.shouldCreateSpanForRequest;

  const _createSpanUrlMap = new LRUMap<string, boolean>(100);
  const _headersUrlMap = new LRUMap<string, boolean>(100);

  const spans: Record<string, Span> = {};

  function _shouldAttachTraceData(url: string): boolean {
    const client = getClient();

    if (!client) {
      return false;
    }

    return shouldPropagateTraceForUrl(url, client.getOptions().tracePropagationTargets, _headersUrlMap);
  }

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

        const { propagateTraceparent } = client.getOptions();
        instrumentFetchRequest(handlerData, _shouldCreateSpan, _shouldAttachTraceData, spans, {
          spanOrigin: 'auto.http.fetch',
          propagateTraceparent,
        });
      });
    },
    setup(client) {
      HAS_CLIENT_MAP.set(client, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments outgoing `fetch` requests in Deno by creating spans and attaching trace propagation headers.
 * The separate breadcrumbs integration continues to record fetch breadcrumbs.
 */
export const fetchIntegration = defineIntegration(_fetchIntegration);
