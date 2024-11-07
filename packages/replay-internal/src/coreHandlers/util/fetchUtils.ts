import { setTimeout } from '@sentry-internal/browser-utils';
import type { Breadcrumb, FetchBreadcrumbData } from '@sentry/types';

import { DEBUG_BUILD } from '../../debug-build';
import type {
  FetchHint,
  NetworkMetaWarning,
  ReplayContainer,
  ReplayNetworkOptions,
  ReplayNetworkRequestData,
  ReplayNetworkRequestOrResponse,
} from '../../types';
import { logger } from '../../util/logger';
import { addNetworkBreadcrumb } from './addNetworkBreadcrumb';
import {
  buildNetworkRequestOrResponse,
  buildSkippedNetworkRequestOrResponse,
  getAllowedHeaders,
  getBodySize,
  getBodyString,
  makeNetworkReplayBreadcrumb,
  mergeWarning,
  parseContentLengthHeader,
  urlMatches,
} from './networkUtils';

/**
 * Capture a fetch breadcrumb to a replay.
 * This adds additional data (where appropriate).
 */
export async function captureFetchBreadcrumbToReplay(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: Partial<FetchHint>,
  options: ReplayNetworkOptions & {
    replay: ReplayContainer;
  },
): Promise<void> {
  try {
    const data = await _prepareFetchData(breadcrumb, hint, options);

    // Create a replay performance entry from this breadcrumb
    const result = makeNetworkReplayBreadcrumb('resource.fetch', data);
    addNetworkBreadcrumb(options.replay, result);
  } catch (error) {
    DEBUG_BUILD && logger.exception(error, 'Failed to capture fetch breadcrumb');
  }
}

/**
 * Enrich a breadcrumb with additional data.
 * This has to be sync & mutate the given breadcrumb,
 * as the breadcrumb is afterwards consumed by other handlers.
 */
export function enrichFetchBreadcrumb(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: Partial<FetchHint>,
): void {
  const { input, response } = hint;

  const body = input ? _getFetchRequestArgBody(input) : undefined;
  const reqSize = getBodySize(body);

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
  hint: Partial<FetchHint>,
  options: ReplayNetworkOptions,
): Promise<ReplayNetworkRequestData> {
  const now = Date.now();
  const { startTimestamp = now, endTimestamp = now } = hint;

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
  input: FetchHint['input'] | undefined,
  requestBodySize?: number,
): ReplayNetworkRequestOrResponse | undefined {
  const headers = input ? getRequestHeaders(input, networkRequestHeaders) : {};

  if (!networkCaptureBodies) {
    return buildNetworkRequestOrResponse(headers, requestBodySize, undefined);
  }

  // We only want to transmit string or string-like bodies
  const requestBody = _getFetchRequestArgBody(input);
  const [bodyStr, warning] = getBodyString(requestBody);
  const data = buildNetworkRequestOrResponse(headers, requestBodySize, bodyStr);

  if (warning) {
    return mergeWarning(data, warning);
  }

  return data;
}

/** Exported only for tests. */
export async function _getResponseInfo(
  captureDetails: boolean,
  {
    networkCaptureBodies,
    networkResponseHeaders,
  }: Pick<ReplayNetworkOptions, 'networkCaptureBodies' | 'networkResponseHeaders'>,
  response: Response | undefined,
  responseBodySize?: number,
): Promise<ReplayNetworkRequestOrResponse | undefined> {
  if (!captureDetails && responseBodySize !== undefined) {
    return buildSkippedNetworkRequestOrResponse(responseBodySize);
  }

  const headers = response ? getAllHeaders(response.headers, networkResponseHeaders) : {};

  if (!response || (!networkCaptureBodies && responseBodySize !== undefined)) {
    return buildNetworkRequestOrResponse(headers, responseBodySize, undefined);
  }

  const [bodyText, warning] = await _parseFetchResponseBody(response);
  const result = getResponseData(bodyText, {
    networkCaptureBodies,

    responseBodySize,
    captureDetails,
    headers,
  });

  if (warning) {
    return mergeWarning(result, warning);
  }

  return result;
}

function getResponseData(
  bodyText: string | undefined,
  {
    networkCaptureBodies,
    responseBodySize,
    captureDetails,
    headers,
  }: {
    captureDetails: boolean;
    networkCaptureBodies: boolean;
    responseBodySize: number | undefined;
    headers: Record<string, string>;
  },
): ReplayNetworkRequestOrResponse | undefined {
  try {
    const size =
      bodyText && bodyText.length && responseBodySize === undefined ? getBodySize(bodyText) : responseBodySize;

    if (!captureDetails) {
      return buildSkippedNetworkRequestOrResponse(size);
    }

    if (networkCaptureBodies) {
      return buildNetworkRequestOrResponse(headers, size, bodyText);
    }

    return buildNetworkRequestOrResponse(headers, size, undefined);
  } catch (error) {
    DEBUG_BUILD && logger.exception(error, 'Failed to serialize response body');
    // fallback
    return buildNetworkRequestOrResponse(headers, responseBodySize, undefined);
  }
}

async function _parseFetchResponseBody(response: Response): Promise<[string | undefined, NetworkMetaWarning?]> {
  const res = _tryCloneResponse(response);

  if (!res) {
    return [undefined, 'BODY_PARSE_ERROR'];
  }

  try {
    const text = await _tryGetResponseText(res);
    return [text];
  } catch (error) {
    if (error instanceof Error && error.message.indexOf('Timeout') > -1) {
      DEBUG_BUILD && logger.warn('Parsing text body from response timed out');
      return [undefined, 'BODY_PARSE_TIMEOUT'];
    }

    DEBUG_BUILD && logger.exception(error, 'Failed to get text body from response');
    return [undefined, 'BODY_PARSE_ERROR'];
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

function _tryCloneResponse(response: Response): Response | void {
  try {
    // We have to clone this, as the body can only be read once
    return response.clone();
  } catch (error) {
    // this can throw if the response was already consumed before
    DEBUG_BUILD && logger.exception(error, 'Failed to clone response body');
  }
}

/**
 * Get the response body of a fetch request, or timeout after 500ms.
 * Fetch can return a streaming body, that may not resolve (or not for a long time).
 * If that happens, we rather abort after a short time than keep waiting for this.
 */
function _tryGetResponseText(response: Response): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout while trying to read response body')), 500);

    _getResponseText(response)
      .then(
        txt => resolve(txt),
        reason => reject(reason),
      )
      .finally(() => clearTimeout(timeout));
  });
}

async function _getResponseText(response: Response): Promise<string> {
  // Force this to be a promise, just to be safe
  // eslint-disable-next-line no-return-await
  return await response.text();
}
