import type { Client } from '../client';
import { getIsolationScope } from '../currentScopes';
import { defineIntegration } from '../integration';
import { SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS } from '../semanticAttributes';
import type { SdkProcessingMetadata } from '../scope';
import type { CollectBehavior, ResolvedDataCollection } from '../types/datacollection';
import type { Event } from '../types/event';
import type { IntegrationFn } from '../types/integration';
import type { QueryParams, RequestEventData } from '../types/request';
import type { StreamedSpanJSON } from '../types/span';
import { cookiePairsToRecord, parseCookieHeader } from '../utils/cookie';
import { SENSITIVE_COOKIE_NAME_SNIPPETS } from '../utils/data-collection/filtering-snippets';
import { filterKeyValueData } from '../utils/data-collection/filterKeyValueData';
import { isLocalhostRequest } from '../utils/localhost';
import { filterQueryParams } from '../utils/data-collection/filterQueryParams';
import { filterUrlQuery } from '../utils/data-collection/filterUrlQuery';
import { filterCookiePairs, httpHeadersToSpanAttributes } from '../utils/request';
import { getUrlQuery } from '../utils/url';
import { getClientIPAddress, ipHeaderNames } from '../vendor/getIpAddress';
import { safeSetSpanJSONAttributes } from '../tracing/spans/captureSpan';
import { SENTRY_IS_LOCALHOST, URL_FULL, URL_QUERY } from '@sentry/conventions/attributes';

type RequestDataIncludeOptions = {
  cookies?: boolean;
  data?: boolean;
  headers?: boolean;
  ip?: boolean;
  query_string?: boolean;
  url?: boolean;
};

type RequestDataIntegrationOptions = {
  /**
   * Defines what request data should be collected.
   *
   * @deprecated Use `dataCollection` from the `init()` options instead. Check the docs for more info: https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection
   */
  include?: RequestDataIncludeOptions;
};

type ResolvedRequestDataOptions = {
  include: Required<RequestDataIncludeOptions>;
  dataCollection: ResolvedDataCollection;
};

const INTEGRATION_NAME = 'RequestData' as const;

const _requestDataIntegration = ((options: RequestDataIntegrationOptions = {}) => {
  function resolveRequestDataOptions(client: Client): ResolvedRequestDataOptions {
    const dataCollection = client.getDataCollectionOptions();
    const include = {
      // oxlint-disable-next-line typescript/no-deprecated
      cookies: options.include?.cookies ?? dataCollection.cookies !== false,
      // Always attach body data that's already on the scope — dataCollection.httpBodies gates write-time, not read-time
      // oxlint-disable-next-line typescript/no-deprecated
      data: options.include?.data ?? true,
      // oxlint-disable-next-line typescript/no-deprecated
      headers: options.include?.headers ?? dataCollection.httpHeaders.request !== false,
      // oxlint-disable-next-line typescript/no-deprecated
      ip: options.include?.ip ?? dataCollection.userInfo,
      // oxlint-disable-next-line typescript/no-deprecated
      query_string: options.include?.query_string ?? dataCollection.urlQueryParams !== false,
      // No dataCollection equivalent — URL is always included
      // oxlint-disable-next-line typescript/no-deprecated
      url: options.include?.url ?? true,
    };

    return {
      include,
      dataCollection: {
        ...dataCollection,
        cookies: resolveFilteringBehavior(include.cookies, dataCollection.cookies),
        httpHeaders: {
          ...dataCollection.httpHeaders,
          request: resolveFilteringBehavior(include.headers, dataCollection.httpHeaders.request),
        },
        urlQueryParams: resolveFilteringBehavior(include.query_string, dataCollection.urlQueryParams),
      },
    };
  }

  return {
    name: INTEGRATION_NAME,
    processEvent(event, _hint, client) {
      const { sdkProcessingMetadata = {} } = event;
      const { normalizedRequest, ipAddress } = sdkProcessingMetadata;

      if (!normalizedRequest) {
        return event;
      }

      const { include, dataCollection } = resolveRequestDataOptions(client);
      addNormalizedRequestDataToEvent(event, normalizedRequest, { ipAddress }, include, dataCollection);

      return event;
    },
    processSpan(span) {
      const { user, sdkProcessingMetadata } = getIsolationScope().getScopeData();

      // This attribute is used by the "Filter out localhost events" feature on the Sentry backend.
      // Therefore, it's set on every span, not just the segment span.
      safeSetSpanJSONAttributes(span, {
        [SENTRY_IS_LOCALHOST]: isLocalhostSpan(sdkProcessingMetadata, user.ip_address),
      });
    },
    processSegmentSpan(span, client) {
      const { sdkProcessingMetadata = {} } = getIsolationScope().getScopeData();
      const { normalizedRequest, ipAddress } = sdkProcessingMetadata;

      if (!normalizedRequest) {
        return;
      }

      const { include, dataCollection } = resolveRequestDataOptions(client);

      addNormalizedRequestDataToSpan(span, normalizedRequest, ipAddress, include, dataCollection);
    },
  };
}) satisfies IntegrationFn;

// Resolving the client IP walks a dozen forwarding headers, so the verdict is computed once per
// request and shared by every span of that request.
const localhostByRequest = new WeakMap<RequestEventData, boolean>();

/**
 * Whether a span belongs to a request served from the developer's own machine.
 *
 * The client IP is resolved exactly as {@link addNormalizedRequestDataToEvent} resolves the IP it
 * writes to `user.ip_address`, so a span and the event for the same request always agree. Crucially
 * a forwarding header wins over `ipAddress`, which is the raw socket address: a reverse proxy on the
 * same host connects over loopback, so trusting the socket would mark genuine production traffic as
 * localhost and let the backend filter silently drop it.
 */
function isLocalhostSpan(sdkProcessingMetadata: SdkProcessingMetadata, scopeUserIpAddress?: string | null): boolean {
  const { normalizedRequest, ipAddress } = sdkProcessingMetadata;

  if (!normalizedRequest) {
    return isLocalhostRequest(undefined, ipAddress || scopeUserIpAddress);
  }

  const cached = localhostByRequest.get(normalizedRequest);
  if (cached !== undefined) {
    return cached;
  }

  const headers = normalizedRequest.headers;
  const clientIpAddress = (headers && getClientIPAddress(headers)) || ipAddress || scopeUserIpAddress;
  const isLocalhost = isLocalhostRequest(normalizedRequest, clientIpAddress);

  localhostByRequest.set(normalizedRequest, isLocalhost);

  return isLocalhost;
}

/**
 * Add data about a request to an event. Primarily for use in Node-based SDKs, but included in `@sentry/core`
 * so it can be used in cross-platform SDKs like `@sentry/nextjs`.
 */
export const requestDataIntegration = defineIntegration(_requestDataIntegration);

/**
 * Add already normalized request data to an event.
 * This mutates the passed in event.
 */
function addNormalizedRequestDataToEvent(
  event: Event,
  req: RequestEventData,
  // Data that should not go into `event.request` but is somehow related to requests
  additionalData: { ipAddress?: string },
  include: RequestDataIncludeOptions,
  dataCollection: ResolvedDataCollection,
): void {
  const requestData = extractNormalizedRequestData(req, include);
  if (requestData.cookies) {
    requestData.cookies = filterKeyValueData(
      requestData.cookies,
      dataCollection.cookies,
      SENSITIVE_COOKIE_NAME_SNIPPETS,
    );
  }
  if (requestData.headers) {
    requestData.headers = filterKeyValueData(requestData.headers, dataCollection.httpHeaders.request);
  }
  if (requestData.query_string) {
    requestData.query_string = normalizeAndFilterQueryString(requestData.query_string, dataCollection.urlQueryParams);
  }
  if (requestData.url) {
    requestData.url = filterUrlQuery(requestData.url, dataCollection.urlQueryParams);
  }

  event.request = {
    ...event.request,
    ...requestData,
  };

  if (include.ip) {
    const ip = (req.headers && getClientIPAddress(req.headers)) || additionalData.ipAddress;
    if (ip) {
      event.user = {
        ...event.user,
        ip_address: ip,
      };
    }
  }
}

function addNormalizedRequestDataToSpan(
  span: StreamedSpanJSON,
  normalizedRequest: RequestEventData,
  ipAddress: string | undefined,
  include: RequestDataIncludeOptions,
  dataCollection: ResolvedDataCollection,
): void {
  const requestData = extractNormalizedRequestData(normalizedRequest, include);
  const attributes: Record<string, unknown> = {};

  if (requestData.url) {
    attributes[URL_FULL] = filterUrlQuery(requestData.url, dataCollection.urlQueryParams);
  }

  if (requestData.method) {
    attributes['http.request.method'] = requestData.method;
  }

  if (requestData.query_string) {
    attributes[URL_QUERY] = normalizeAndFilterQueryString(requestData.query_string, dataCollection.urlQueryParams);
  }

  safeSetSpanJSONAttributes(span, attributes);

  // Process cookies before headers so normalizedRequest.cookies takes precedence
  // over the raw cookie header (matching the processEvent path).
  if (include.cookies) {
    // Cookies are not serialized to a string and re-parsed: a decoded value could contain ";" and
    // split into a second, differently named cookie that escapes the denylist.
    const cookieHeader = normalizedRequest.headers?.cookie;
    const cookiePairs = normalizedRequest.cookies
      ? Object.entries(normalizedRequest.cookies)
      : cookieHeader
        ? parseCookieHeader(cookieHeader, 'cookie')
        : [];
    if (cookiePairs.length > 0) {
      safeSetSpanJSONAttributes(span, {
        'http.request.header.cookie': filterCookiePairs(cookiePairs, dataCollection.cookies),
      });
    }
  }

  if (requestData.headers) {
    const headerAttributes = httpHeadersToSpanAttributes(requestData.headers, dataCollection, 'request');
    safeSetSpanJSONAttributes(span, headerAttributes);
  }

  if (requestData.data != null) {
    const serialized = typeof requestData.data === 'string' ? requestData.data : JSON.stringify(requestData.data);
    if (serialized) {
      safeSetSpanJSONAttributes(span, { 'http.request.body.data': serialized });
    }
  }

  if (include.ip) {
    const ip = (normalizedRequest.headers && getClientIPAddress(normalizedRequest.headers)) || ipAddress || undefined;
    if (ip) {
      safeSetSpanJSONAttributes(span, { [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: ip });
    }
  }
}

function extractNormalizedRequestData(
  normalizedRequest: RequestEventData,
  include: RequestDataIncludeOptions,
): RequestEventData {
  const requestData: RequestEventData = {};
  const headers = { ...normalizedRequest.headers };

  if (include.headers) {
    requestData.headers = headers;

    if (!include.cookies) {
      delete (headers as { cookie?: string }).cookie;
    }

    if (!include.ip) {
      const ipHeaderNamesLower = new Set(ipHeaderNames.map(name => name.toLowerCase()));
      for (const key of Object.keys(headers)) {
        if (ipHeaderNamesLower.has(key.toLowerCase())) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete (headers as Record<string, unknown>)[key];
        }
      }
    }
  }

  requestData.method = normalizedRequest.method;

  if (include.url) {
    requestData.url = normalizedRequest.url;
  }

  if (include.cookies) {
    const cookies =
      normalizedRequest.cookies ||
      (headers?.cookie ? cookiePairsToRecord(parseCookieHeader(headers.cookie, 'cookie')) : undefined);
    requestData.cookies = cookies || {};
  }

  if (include.query_string) {
    requestData.query_string = normalizedRequest.query_string;
  }

  if (include.data) {
    requestData.data = normalizedRequest.data;
  }

  return requestData;
}

function resolveFilteringBehavior(isIncluded: boolean, behavior: CollectBehavior): CollectBehavior {
  return isIncluded && behavior === false ? true : behavior;
}

function normalizeAndFilterQueryString(queryString: QueryParams, behavior: CollectBehavior): string | undefined {
  const normalized = normalizeQueryString(queryString);
  return normalized ? filterQueryParams(normalized, behavior) : undefined;
}

function normalizeQueryString(queryString: QueryParams): string | undefined {
  if (typeof queryString === 'string') {
    return getUrlQuery(queryString);
  }

  const pairs = Array.isArray(queryString) ? queryString : Object.entries(queryString);
  const normalized = new URLSearchParams(pairs).toString();
  return normalized || undefined;
}
