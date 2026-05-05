import type { RequestDataIncludeOptions } from '../../integrations/requestdata';
import { SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS } from '../../semanticAttributes';
import type { QueryParams, RequestEventData } from '../../types-hoist/request';
import type { StreamedSpanJSON } from '../../types-hoist/span';
import { httpHeadersToSpanAttributes } from '../../utils/request';
import { getClientIPAddress, ipHeaderNames } from '../../vendor/getIpAddress';
import { safeSetSpanJSONAttributes } from './spanAttributeUtils';

// Span-streaming counterpart of requestDataIntegration's processEvent.
export function applyRequestDataToSegmentSpan(
  segmentSpanJSON: StreamedSpanJSON,
  normalizedRequest: RequestEventData,
  ipAddress: string | undefined,
  include: RequestDataIncludeOptions,
  sendDefaultPii: boolean | undefined,
): void {
  const attributes: Record<string, unknown> = {};

  if (include.url && normalizedRequest.url) {
    attributes['url.full'] = normalizedRequest.url;
  }

  if (normalizedRequest.method) {
    attributes['http.request.method'] = normalizedRequest.method;
  }

  if (include.query_string && normalizedRequest.query_string) {
    attributes['url.query'] = normalizeQueryString(normalizedRequest.query_string);
  }

  safeSetSpanJSONAttributes(segmentSpanJSON, attributes);

  // Process cookies before headers so normalizedRequest.cookies takes precedence
  // over the raw cookie header (matching the processEvent path in requestdata.ts).
  if (include.cookies) {
    const cookieString = normalizedRequest.cookies
      ? Object.entries(normalizedRequest.cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join('; ')
      : normalizedRequest.headers?.cookie;

    if (cookieString) {
      const cookieAttributes = httpHeadersToSpanAttributes(
        { cookie: cookieString },
        sendDefaultPii ?? false,
        'request',
      );
      safeSetSpanJSONAttributes(segmentSpanJSON, cookieAttributes);
    }
  }

  if (include.headers && normalizedRequest.headers) {
    const headers = { ...normalizedRequest.headers };

    if (!include.cookies) {
      delete headers.cookie;
    }

    if (!include.ip) {
      const ipHeaderNamesLower = new Set(ipHeaderNames.map(name => name.toLowerCase()));
      for (const key of Object.keys(headers)) {
        if (ipHeaderNamesLower.has(key.toLowerCase())) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete headers[key];
        }
      }
    }

    const headerAttributes = httpHeadersToSpanAttributes(headers, sendDefaultPii ?? false, 'request');
    safeSetSpanJSONAttributes(segmentSpanJSON, headerAttributes);
  }

  if (include.data && normalizedRequest.data != null) {
    const serialized =
      typeof normalizedRequest.data === 'string' ? normalizedRequest.data : JSON.stringify(normalizedRequest.data);
    if (serialized) {
      safeSetSpanJSONAttributes(segmentSpanJSON, { 'http.request.body.data': serialized });
    }
  }

  if (include.ip) {
    const ip = (normalizedRequest.headers && getClientIPAddress(normalizedRequest.headers)) || ipAddress || undefined;
    if (ip) {
      safeSetSpanJSONAttributes(segmentSpanJSON, { [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: ip });
    }
  }
}

function normalizeQueryString(queryString: QueryParams): string | undefined {
  if (typeof queryString === 'string') {
    return queryString || undefined;
  }

  const pairs = Array.isArray(queryString) ? queryString : Object.entries(queryString);
  const result = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');

  return result || undefined;
}
