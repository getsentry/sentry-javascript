import { addBreadcrumb } from '../breadcrumbs';
import type { Client } from '../client';
import { getClient } from '../currentScopes';
import { instrumentFetchRequest } from '../fetch';
import { defineIntegration } from '../integration';
import { addFetchInstrumentationHandler } from '../instrument/fetch';
import type { FetchBreadcrumbData, FetchBreadcrumbHint } from '../types/breadcrumb';
import type { HandlerDataFetch } from '../types/instrument';
import type { Integration, IntegrationFn } from '../types/integration';
import type { Span, SpanOrigin } from '../types/span';
import { getBreadcrumbLogLevelFromHttpStatusCode } from '../utils/breadcrumb-log-level';
import { isSentryRequestUrl } from '../utils/isSentryRequestUrl';
import { LRUMap } from '../utils/lru';
import { shouldPropagateTraceForUrl } from '../utils/tracePropagationTargets';

export interface FetchIntegrationOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   *
   * @default `true`
   */
  breadcrumbs?: boolean;

  /**
   * Function determining whether or not to create spans to track outgoing requests to the given URL.
   * By default, spans will be created for all outgoing requests.
   */
  shouldCreateSpanForRequest?: (url: string) => boolean;

  /**
   * Whether to inject trace propagation headers (`sentry-trace`, `baggage`) into outgoing requests.
   *
   * To scope propagation to specific URLs, configure `tracePropagationTargets` in the client options
   * instead. Turn this off only to suppress propagation entirely, for example alongside
   * `shouldCreateSpanForRequest`, which suppresses the span but not the headers.
   *
   * Covers the global `fetch` only. A runtime that also instruments another HTTP client switches
   * that one separately, for example `denoHttpIntegration({ tracePropagation: false })`.
   *
   * @default `true`
   */
  tracePropagation?: boolean;
}

interface CreateFetchIntegrationOptions {
  /** Integration name, e.g. `'Fetch'`. */
  name: string;

  /** Span origin for the `http.client` spans this integration creates. */
  spanOrigin: SpanOrigin;
}

interface ClientConfig {
  breadcrumbs: boolean;
  shouldCreateSpan: (url: string) => boolean;
  shouldAttachTraceData: (url: string) => boolean;
}

/**
 * Upper bound on spans waiting for their request to settle.
 *
 * `instrumentFetchRequest` adds an entry when a request starts and deletes it when the request
 * ends. A request whose promise never settles never reports an end, so its entry has no other way
 * out. Without a cap those orphans accumulate for the lifetime of the process.
 *
 * The sweep runs once per this many starts rather than on every request, so the record holds at
 * most twice this many entries between sweeps.
 */
const MAX_PENDING_SPANS = 1000;

/**
 * Drops the oldest entries once there are more than {@link MAX_PENDING_SPANS}.
 *
 * A record iterates integer-like keys first and every other key in insertion order. Span ids are
 * 16 hex characters, so even an all-digit one is far above the largest array index and can never
 * be integer-like: the entries at the head are always the oldest. Dropping one only loses the
 * timing of a request that never finished.
 */
function dropOrphanedSpans(spans: Record<string, Span>): void {
  const ids = Object.keys(spans);

  for (let i = 0; i < ids.length - MAX_PENDING_SPANS; i++) {
    // oxlint-disable-next-line typescript/no-dynamic-delete
    delete spans[ids[i] as string];
  }
}

/**
 * Builds an integration that instruments the global `fetch` function: creates `http.client` spans,
 * records breadcrumbs, and attaches trace propagation headers.
 *
 * Runtimes that patch the global `fetch` (Bun, Cloudflare Workers, Deno, Vercel Edge) differ only in
 * the integration name and span origin, so they all share this implementation. Node is not one of
 * them: it instruments undici through diagnostics channels instead. Neither is the browser, whose
 * fetch tracing is driven by `browserTracingIntegration` and shares its span map with XHR.
 */
export function createFetchIntegration({
  name,
  spanOrigin,
}: CreateFetchIntegrationOptions): (options?: FetchIntegrationOptions) => Integration {
  // Shared by every instance of this integration, because `setupOnce` runs once per process: the
  // handler it registers must be able to end a span that a different instance started.
  const spans: Record<string, Span> = {};

  // Keyed by client rather than captured in the instance closure, so that a second `init()` uses its
  // own options instead of silently inheriting the first one's.
  const configs = new WeakMap<Client, ClientConfig>();

  // Counting requests since the last sweep keeps `Object.keys` off the per-request path.
  let startsSinceSweep = 0;

  const integration = ((options: FetchIntegrationOptions = {}) => {
    return {
      name,
      setupOnce() {
        addFetchInstrumentationHandler(handlerData => {
          const client = getClient();
          const config = client && configs.get(client);

          if (!client || !config) {
            return;
          }

          if (isSentryRequestUrl(handlerData.fetchData.url, client)) {
            return;
          }

          const { propagateTraceparent } = client.getOptions();
          instrumentFetchRequest(handlerData, config.shouldCreateSpan, config.shouldAttachTraceData, spans, {
            spanOrigin,
            propagateTraceparent,
          });

          if (!handlerData.endTimestamp && ++startsSinceSweep >= MAX_PENDING_SPANS) {
            startsSinceSweep = 0;
            dropOrphanedSpans(spans);
          }

          if (config.breadcrumbs) {
            createBreadcrumb(handlerData);
          }
        });
      },
      setup(client) {
        configs.set(client, resolveConfig(client, options));
      },
    };
  }) satisfies IntegrationFn;

  return defineIntegration(integration);
}

function resolveConfig(client: Client, options: FetchIntegrationOptions): ClientConfig {
  const { breadcrumbs = true, shouldCreateSpanForRequest, tracePropagation = true } = options;

  const createSpanUrlMap = new LRUMap<string, boolean>(100);
  const headersUrlMap = new LRUMap<string, boolean>(100);

  return {
    breadcrumbs,

    shouldCreateSpan(url) {
      if (shouldCreateSpanForRequest === undefined) {
        return true;
      }

      const cachedDecision = createSpanUrlMap.get(url);
      if (cachedDecision !== undefined) {
        return cachedDecision;
      }

      const decision = shouldCreateSpanForRequest(url);
      createSpanUrlMap.set(url, decision);
      return decision;
    },

    shouldAttachTraceData(url) {
      if (!tracePropagation) {
        return false;
      }

      return shouldPropagateTraceForUrl(url, client.getOptions().tracePropagationTargets, headersUrlMap);
    },
  };
}

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
