import { getIsolationScope } from '../currentScopes';
import { defineIntegration } from '../integration';
import { SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS } from '../semanticAttributes';
import type { Event } from '../types-hoist/event';
import type { IntegrationFn } from '../types-hoist/integration';
import type { QueryParams, RequestEventData } from '../types-hoist/request';
import type { StreamedSpanJSON } from '../types-hoist/span';
import { parseCookie } from '../utils/cookie';
import { httpHeadersToSpanAttributes } from '../utils/request';
import { getClientIPAddress, ipHeaderNames } from '../vendor/getIpAddress';
import { safeSetSpanJSONAttributes } from '../tracing/spans/captureSpan';

interface RequestDataIncludeOptions {
  cookies?: boolean;
  data?: boolean;
  headers?: boolean;
  ip?: boolean;
  query_string?: boolean;
  url?: boolean;
}

type RequestDataIntegrationOptions = {
  /**
   * Controls what data is pulled from the request and added to the event.
   */
  include?: RequestDataIncludeOptions;
};

// TODO(v11): Change defaults based on `sendDefaultPii`
const DEFAULT_INCLUDE: RequestDataIncludeOptions = {
  cookies: true,
  data: true,
  headers: true,
  query_string: true,
  url: true,
};

const INTEGRATION_NAME = 'RequestData';

const _requestDataIntegration = ((options: RequestDataIntegrationOptions = {}) => {
  const include = {
    ...DEFAULT_INCLUDE,
    ...options.include,
  };

  return {
    name: INTEGRATION_NAME,
    processEvent(event, _hint, client) {
      const { sdkProcessingMetadata = {} } = event;
      const { normalizedRequest, ipAddress } = sdkProcessingMetadata;

      const includeWithDefaultPiiApplied: RequestDataIncludeOptions = {
        ...include,
        ip: include.ip ?? client.getOptions().sendDefaultPii,
      };

      if (normalizedRequest) {
        addNormalizedRequestDataToEvent(event, normalizedRequest, { ipAddress }, includeWithDefaultPiiApplied);
      }

      return event;
    },
    processSegmentSpan(span, client) {
      const { sdkProcessingMetadata } = getIsolationScope().getScopeData();
      const { normalizedRequest, ipAddress } = sdkProcessingMetadata;

      if (!normalizedRequest) {
        return;
      }

      const { sendDefaultPii } = client.getOptions();
      const includeWithDefaultPiiApplied: RequestDataIncludeOptions = {
        ...include,
        ip: include.ip ?? sendDefaultPii,
      };

      addNormalizedRequestDataToSpan(span, normalizedRequest, ipAddress, includeWithDefaultPiiApplied, sendDefaultPii);
    },
  };
}) satisfies IntegrationFn;

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
  additionalData: { ipAddress?: string },
  include: RequestDataIncludeOptions,
): void {
  event.request = {
    ...event.request,
    ...extractNormalizedRequestData(req, include),
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
  sendDefaultPii: boolean | undefined,
): void {
  const requestData = extractNormalizedRequestData(normalizedRequest, include);
  const attributes: Record<string, unknown> = {};

  if (requestData.url) {
    attributes['url.full'] = requestData.url;
  }

  if (requestData.method) {
    attributes['http.request.method'] = requestData.method;
  }

  if (requestData.query_string) {
    attributes['url.query'] = normalizeQueryString(requestData.query_string);
  }

  safeSetSpanJSONAttributes(span, attributes);

  // Process cookies before headers so normalizedRequest.cookies takes precedence
  // over the raw cookie header (matching the processEvent path).
  if (requestData.cookies && Object.keys(requestData.cookies).length > 0) {
    const cookieString = Object.entries(requestData.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const cookieAttributes = httpHeadersToSpanAttributes({ cookie: cookieString }, sendDefaultPii ?? false, 'request');
    safeSetSpanJSONAttributes(span, cookieAttributes);
  }

  if (requestData.headers) {
    const headerAttributes = httpHeadersToSpanAttributes(requestData.headers, sendDefaultPii ?? false, 'request');
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
    const cookies = normalizedRequest.cookies || (headers?.cookie ? parseCookie(headers.cookie) : undefined);
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

function normalizeQueryString(queryString: QueryParams): string | undefined {
  if (typeof queryString === 'string') {
    return queryString || undefined;
  }

  const pairs = Array.isArray(queryString) ? queryString : Object.entries(queryString);
  const result = pairs.map(([key, value]) => `${key}=${value}`).join('&');

  return result || undefined;
}
