import type { Breadcrumb, FetchBreadcrumbData, TextEncoderInternal } from '@sentry/types';
import { logger } from '@sentry/utils';

import type {
  FetchHint,
  ReplayContainer,
  ReplayNetworkOptions,
  ReplayNetworkRequestData,
  ReplayNetworkRequestOrResponse,
} from '../../types';
import { addNetworkBreadcrumb } from './addNetworkBreadcrumb';
import {
  buildNetworkRequestOrResponse,
  buildSkippedNetworkRequestOrResponse,
  getAllowedHeaders,
  getBodySize,
  getBodyString,
  makeNetworkReplayBreadcrumb,
  parseContentLengthHeader,
  urlMatches,
} from './networkUtils';

/**
 * Capture a fetch breadcrumb to a replay.
 * This adds additional data (where approriate).
 */
export async function captureFetchBreadcrumbToReplay(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: FetchHint,
  options: ReplayNetworkOptions & {
    textEncoder: TextEncoderInternal;
    replay: ReplayContainer;
  },
): Promise<void> {
  try {
    const data = await _prepareFetchData(breadcrumb, hint, options);

    // Create a replay performance entry from this breadcrumb
    const result = makeNetworkReplayBreadcrumb('resource.fetch', data);
    addNetworkBreadcrumb(options.replay, result);
  } catch (error) {
    __DEBUG_BUILD__ && logger.error('[Replay] Failed to capture fetch breadcrumb', error);
  }
}

/**
 * Enrich a breadcrumb with additional data.
 * This has to be sync & mutate the given breadcrumb,
 * as the breadcrumb is afterwards consumed by other handlers.
 */
export function enrichFetchBreadcrumb(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: FetchHint,
  options: { textEncoder: TextEncoderInternal },
): void {
  const { input, response } = hint;

  const body = _getFetchRequestArgBody(input);
  const reqSize = getBodySize(body, options.textEncoder);

  const resSize = response ? parseContentLengthHeader(response.headers.get('content-length')) : undefined;

  if (reqSize !== undefined) {
    breadcrumb.data.request_body_size = reqSize;
  }
  if (resSize !== undefined) {
    breadcrumb.data.response_body_size = resSize;
  }
}

async function _prepareFetchData(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: FetchHint,
  options: ReplayNetworkOptions & {
    textEncoder: TextEncoderInternal;
  },
): Promise<ReplayNetworkRequestData> {
  const { startTimestamp, endTimestamp } = hint;

  const {
    url,
    method,
    status_code: statusCode = 0,
    request_body_size: requestBodySize,
    response_body_size: responseBodySize,
  } = breadcrumb.data;

  const captureDetails =
    urlMatches(url, options.networkDetailAllowUrls) && !urlMatches(url, options.networkDetailDenyUrls);

  const request = captureDetails
    ? _getRequestInfo(options, hint.input, requestBodySize)
    : buildSkippedNetworkRequestOrResponse(requestBodySize);
  const response = await _getResponseInfo(captureDetails, options, hint.response, responseBodySize);

  return {
    startTimestamp,
    endTimestamp,
    url,
    method,
    statusCode,
    request,
    response,
  };
}

function _getRequestInfo(
  { networkCaptureBodies, networkRequestHeaders }: ReplayNetworkOptions,
  input: FetchHint['input'],
  requestBodySize?: number,
): ReplayNetworkRequestOrResponse | undefined {
  const headers = getRequestHeaders(input, networkRequestHeaders);

  if (!networkCaptureBodies) {
    return buildNetworkRequestOrResponse(headers, requestBodySize, undefined);
  }

  // We only want to transmit string or string-like bodies
  const requestBody = _getFetchRequestArgBody(input);
  const bodyStr = getBodyString(requestBody);
  return buildNetworkRequestOrResponse(headers, requestBodySize, bodyStr);
}

async function _getResponseInfo(
  captureDetails: boolean,
  {
    networkCaptureBodies,
    textEncoder,
    networkResponseHeaders,
  }: ReplayNetworkOptions & {
    textEncoder: TextEncoderInternal;
  },
  response: Response,
  responseBodySize?: number,
): Promise<ReplayNetworkRequestOrResponse | undefined> {
  if (!captureDetails && responseBodySize !== undefined) {
    return buildSkippedNetworkRequestOrResponse(responseBodySize);
  }

  const headers = getAllHeaders(response.headers, networkResponseHeaders);

  if (!networkCaptureBodies && responseBodySize !== undefined) {
    return buildNetworkRequestOrResponse(headers, responseBodySize, undefined);
  }

  // Only clone the response if we need to
  try {
    // We have to clone this, as the body can only be read once
    const res = response.clone();
    const bodyText = await _parseFetchBody(res);

    const size =
      bodyText && bodyText.length && responseBodySize === undefined
        ? getBodySize(bodyText, textEncoder)
        : responseBodySize;

    if (!captureDetails) {
      return buildSkippedNetworkRequestOrResponse(size);
    }

    if (networkCaptureBodies) {
      return buildNetworkRequestOrResponse(headers, size, bodyText);
    }

    return buildNetworkRequestOrResponse(headers, size, undefined);
  } catch {
    // fallback
    return buildNetworkRequestOrResponse(headers, responseBodySize, undefined);
  }
}

async function _parseFetchBody(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function _getFetchRequestArgBody(fetchArgs: unknown[] = []): RequestInit['body'] | undefined {
  // We only support getting the body from the fetch options
  if (fetchArgs.length !== 2 || typeof fetchArgs[1] !== 'object') {
    return undefined;
  }

  return (fetchArgs[1] as RequestInit).body;
}

function getAllHeaders(headers: Headers, allowedHeaders: string[]): Record<string, string> {
  const allHeaders: Record<string, string> = {};

  allowedHeaders.forEach(header => {
    if (headers.get(header)) {
      allHeaders[header] = headers.get(header) as string;
    }
  });

  return allHeaders;
}

function getRequestHeaders(fetchArgs: unknown[], allowedHeaders: string[]): Record<string, string> {
  if (fetchArgs.length === 1 && typeof fetchArgs[0] !== 'string') {
    return getHeadersFromOptions(fetchArgs[0] as Request | RequestInit, allowedHeaders);
  }

  if (fetchArgs.length === 2) {
    return getHeadersFromOptions(fetchArgs[1] as Request | RequestInit, allowedHeaders);
  }

  return {};
}

function getHeadersFromOptions(
  input: Request | RequestInit | undefined,
  allowedHeaders: string[],
): Record<string, string> {
  if (!input) {
    return {};
  }

  const headers = input.headers;

  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return getAllHeaders(headers, allowedHeaders);
  }

  // We do not support this, as it is not really documented (anymore?)
  if (Array.isArray(headers)) {
    return {};
  }

  return getAllowedHeaders(headers, allowedHeaders);
}
