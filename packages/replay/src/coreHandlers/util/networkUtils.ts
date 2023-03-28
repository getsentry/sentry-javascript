import type { TextEncoderInternal } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { NETWORK_BODY_MAX_SIZE } from '../../constants';
import type {
  NetworkBody,
  NetworkRequestData,
  ReplayNetworkRequestData,
  ReplayNetworkRequestOrResponse,
  ReplayPerformanceEntry,
} from '../../types';

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

/** Build the request or response part of a replay network breadcrumb. */
export function buildNetworkRequestOrResponse(
  bodySize: number | undefined,
  body: NetworkBody | undefined,
): ReplayNetworkRequestOrResponse | undefined {
  if (!bodySize) {
    return undefined;
  }

  if (!body) {
    return {
      size: bodySize,
    };
  }

  const info: ReplayNetworkRequestOrResponse = {
    size: bodySize,
  };

  if (bodySize < NETWORK_BODY_MAX_SIZE) {
    info.body = body;
  } else {
    info._meta = {
      errors: ['MAX_BODY_SIZE_EXCEEDED'],
    };
  }

  return info;
}

function _serializeFormData(formData: FormData): string {
  // This is a bit simplified, but gives us a decent estimate
  // This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'
  // @ts-ignore passing FormData to URLSearchParams actually works
  return new URLSearchParams(formData).toString();
}
