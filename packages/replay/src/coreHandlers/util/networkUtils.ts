import type { TextEncoderInternal } from '@sentry/types';
import { dropUndefinedKeys, stringMatchesSomePattern } from '@sentry/utils';

import { NETWORK_BODY_MAX_SIZE, WINDOW } from '../../constants';
import type {
  NetworkBody,
  NetworkMetaWarning,
  NetworkRequestData,
  ReplayNetworkRequestData,
  ReplayNetworkRequestOrResponse,
  ReplayPerformanceEntry,
} from '../../types';
import { fixJson } from '../../util/truncateJson/fixJson';

/** Get the size of a body. */
export function getBodySize(
  body: RequestInit['body'],
  textEncoder: TextEncoder | TextEncoderInternal,
): number | undefined {
  if (!body) {
    return undefined;
  }

  try {
    if (typeof body === 'string') {
      return textEncoder.encode(body).length;
    }

    if (body instanceof URLSearchParams) {
      return textEncoder.encode(body.toString()).length;
    }

    if (body instanceof FormData) {
      const formDataStr = _serializeFormData(body);
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

/** Get the string representation of a body. */
export function getBodyString(body: unknown): string | undefined {
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof FormData) {
    return _serializeFormData(body);
  }

  return undefined;
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
    data: dropUndefinedKeys({
      method,
      statusCode,
      request,
      response,
    }),
  };

  return result;
}

/** Get either a JSON network body, or a text representation. */
export function getNetworkBody(bodyText: string | undefined): NetworkBody | undefined {
  if (!bodyText) {
    return;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    // return text
  }

  return bodyText;
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
  if (warnings.length > 0) {
    info._meta = {
      warnings,
    };
  }

  return info;
}

/** Filter a set of headers */
export function getAllowedHeaders(headers: Record<string, string>, allowedHeaders: string[]): Record<string, string> {
  return Object.keys(headers).reduce((filteredHeaders: Record<string, string>, key: string) => {
    const normalizedKey = key.toLowerCase();
    // Avoid putting empty strings into the headers
    if (allowedHeaders.includes(normalizedKey) && headers[key]) {
      filteredHeaders[normalizedKey] = headers[key];
    }
    return filteredHeaders;
  }, {});
}

function _serializeFormData(formData: FormData): string {
  // This is a bit simplified, but gives us a decent estimate
  // This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'
  // @ts-ignore passing FormData to URLSearchParams actually works
  return new URLSearchParams(formData).toString();
}

function normalizeNetworkBody(body: string | undefined): {
  body: NetworkBody | undefined;
  warnings: NetworkMetaWarning[];
} {
  if (!body || typeof body !== 'string') {
    return {
      body,
      warnings: [],
    };
  }

  const exceedsSizeLimit = body.length > NETWORK_BODY_MAX_SIZE;

  if (_strIsProbablyJson(body)) {
    try {
      const json = exceedsSizeLimit ? fixJson(body.slice(0, NETWORK_BODY_MAX_SIZE)) : body;
      const normalizedBody = JSON.parse(json);
      return {
        body: normalizedBody,
        warnings: exceedsSizeLimit ? ['JSON_TRUNCATED'] : [],
      };
    } catch {
      return {
        body: exceedsSizeLimit ? `${body.slice(0, NETWORK_BODY_MAX_SIZE)}…` : body,
        warnings: exceedsSizeLimit ? ['INVALID_JSON', 'TEXT_TRUNCATED'] : ['INVALID_JSON'],
      };
    }
  }

  return {
    body: exceedsSizeLimit ? `${body.slice(0, NETWORK_BODY_MAX_SIZE)}…` : body,
    warnings: exceedsSizeLimit ? ['TEXT_TRUNCATED'] : [],
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
