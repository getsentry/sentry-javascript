import { stringMatchesSomePattern } from '@sentry/core';
import type { NetworkMetaWarning } from '@sentry-internal/browser-utils';
import { serializeFormData } from '@sentry-internal/browser-utils';
import { NETWORK_BODY_MAX_SIZE, WINDOW } from '../../constants';
import type {
  NetworkBody,
  NetworkRequestData,
  ReplayNetworkRequestData,
  ReplayNetworkRequestOrResponse,
  ReplayPerformanceEntry,
} from '../../types';

/** Get the size of a body. */
export function getBodySize(body: RequestInit['body']): number | undefined {
  if (!body) {
    return undefined;
  }

  const textEncoder = new TextEncoder();

  try {
    if (typeof body === 'string') {
      return textEncoder.encode(body).length;
    }

    if (body instanceof URLSearchParams) {
      return textEncoder.encode(body.toString()).length;
    }

    if (body instanceof FormData) {
      const formDataStr = serializeFormData(body);
      return textEncoder.encode(formDataStr).length;
    }

    if (body instanceof Blob) {
      return body.size;
    }

    if (body instanceof ArrayBuffer) {
      return body.byteLength;
    }

    // Currently unhandled types: ArrayBufferView, ReadableStream
  } catch {
    // just return undefined
  }

  return undefined;
}

/** Convert a Content-Length header to number/undefined.  */
export function parseContentLengthHeader(header: string | null | undefined): number | undefined {
  if (!header) {
    return undefined;
  }

  const size = parseInt(header, 10);
  return isNaN(size) ? undefined : size;
}

/** Merge a warning into an existing network request/response. */
export function mergeWarning(
  info: ReplayNetworkRequestOrResponse | undefined,
  warning: NetworkMetaWarning,
): ReplayNetworkRequestOrResponse {
  if (!info) {
    return {
      headers: {},
      size: undefined,
      _meta: {
        warnings: [warning],
      },
    };
  }

  const newMeta = { ...info._meta };
  const existingWarnings = newMeta.warnings || [];
  newMeta.warnings = [...existingWarnings, warning];

  info._meta = newMeta;
  return info;
}

/** Convert ReplayNetworkRequestData to a PerformanceEntry. */
export function makeNetworkReplayBreadcrumb(
  type: string,
  data: ReplayNetworkRequestData | null,
): ReplayPerformanceEntry<NetworkRequestData> | null {
  if (!data) {
    return null;
  }

  const { startTimestamp, endTimestamp, url, method, statusCode, request, response } = data;

  const result: ReplayPerformanceEntry<NetworkRequestData> = {
    type,
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    name: url,
    data: {
      method,
      statusCode,
      request,
      response,
    },
  };

  return result;
}

/** Build the request or response part of a replay network breadcrumb that was skipped. */
export function buildSkippedNetworkRequestOrResponse(bodySize: number | undefined): ReplayNetworkRequestOrResponse {
  return {
    headers: {},
    size: bodySize,
    _meta: {
      warnings: ['URL_SKIPPED'],
    },
  };
}

/** Build the request or response part of a replay network breadcrumb. */
export function buildNetworkRequestOrResponse(
  headers: Record<string, string>,
  bodySize: number | undefined,
  body: string | undefined,
): ReplayNetworkRequestOrResponse | undefined {
  if (!bodySize && Object.keys(headers).length === 0) {
    return undefined;
  }

  if (!bodySize) {
    return {
      headers,
    };
  }

  if (!body) {
    return {
      headers,
      size: bodySize,
    };
  }

  const info: ReplayNetworkRequestOrResponse = {
    headers,
    size: bodySize,
  };

  const { body: normalizedBody, warnings } = normalizeNetworkBody(body);
  info.body = normalizedBody;
  if (warnings?.length) {
    info._meta = {
      warnings,
    };
  }

  return info;
}

/** Filter a set of headers */
export function getAllowedHeaders(headers: Record<string, string>, allowedHeaders: string[]): Record<string, string> {
  return Object.entries(headers).reduce((filteredHeaders: Record<string, string>, [key, value]) => {
    const normalizedKey = key.toLowerCase();
    // Avoid putting empty strings into the headers
    if (allowedHeaders.includes(normalizedKey) && headers[key]) {
      filteredHeaders[normalizedKey] = value;
    }
    return filteredHeaders;
  }, {});
}

function normalizeNetworkBody(body: string | undefined): {
  body: NetworkBody | undefined;
  warnings?: NetworkMetaWarning[];
} {
  if (!body || typeof body !== 'string') {
    return {
      body,
    };
  }

  const exceedsSizeLimit = body.length > NETWORK_BODY_MAX_SIZE;
  const isProbablyJson = _strIsProbablyJson(body);

  if (exceedsSizeLimit) {
    const truncatedBody = body.slice(0, NETWORK_BODY_MAX_SIZE);

    if (isProbablyJson) {
      return {
        body: truncatedBody,
        warnings: ['MAYBE_JSON_TRUNCATED'],
      };
    }

    return {
      body: `${truncatedBody}…`,
      warnings: ['TEXT_TRUNCATED'],
    };
  }

  if (isProbablyJson) {
    try {
      const jsonBody = JSON.parse(body);
      return {
        body: jsonBody,
      };
    } catch {
      // fall back to just send the body as string
    }
  }

  return {
    body,
  };
}

function _strIsProbablyJson(str: string): boolean {
  const first = str[0];
  const last = str[str.length - 1];

  // Simple check: If this does not start & end with {} or [], it's not JSON
  return (first === '[' && last === ']') || (first === '{' && last === '}');
}

/** Match an URL against a list of strings/Regex. */
export function urlMatches(url: string, urls: (string | RegExp)[]): boolean {
  const fullUrl = getFullUrl(url);

  return stringMatchesSomePattern(fullUrl, urls);
}

/** exported for tests */
export function getFullUrl(url: string, baseURI = WINDOW.document.baseURI): string {
  // Short circuit for common cases:
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith(WINDOW.location.origin)) {
    return url;
  }
  const fixedUrl = new URL(url, baseURI);

  // If these do not match, we are not dealing with a relative URL, so just return it
  if (fixedUrl.origin !== new URL(baseURI).origin) {
    return url;
  }

  const fullUrl = fixedUrl.href;

  // Remove trailing slashes, if they don't match the original URL
  if (!url.endsWith('/') && fullUrl.endsWith('/')) {
    return fullUrl.slice(0, -1);
  }

  return fullUrl;
}
