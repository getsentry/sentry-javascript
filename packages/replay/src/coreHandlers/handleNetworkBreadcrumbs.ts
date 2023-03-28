import { getCurrentHub } from '@sentry/core';
import type {
  Breadcrumb,
  BreadcrumbHint,
  FetchBreadcrumbData,
  FetchBreadcrumbHint,
  HandlerDataFetch,
  SentryWrappedXMLHttpRequest,
  TextEncoderInternal,
  XhrBreadcrumbData,
  XhrBreadcrumbHint,
} from '@sentry/types';
import { addInstrumentationHandler, logger } from '@sentry/utils';

import type { NetworkRequestData, ReplayContainer, ReplayPerformanceEntry } from '../types';
import { addNetworkBreadcrumb } from './addNetworkBreadcrumb';
import { handleFetchSpanListener } from './handleFetch';
import { handleXhrSpanListener } from './handleXhr';

type RequestBody = null | Blob | BufferSource | FormData | URLSearchParams | string;

type XhrHint = XhrBreadcrumbHint & { xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest; input?: RequestBody };
type FetchHint = FetchBreadcrumbHint & {
  input: HandlerDataFetch['args'];
  response: Response;
};

interface ExtendedNetworkBreadcrumbsOptions {
  replay: ReplayContainer;
  textEncoder: TextEncoderInternal;
}

/**
 * This will enrich the xhr/fetch breadcrumbs with additional information.
 *
 * This adds:
 * * request_body_size
 * * response_body_size
 *
 * to the breadcrumb data.
 */
export function handleNetworkBreadcrumbs(replay: ReplayContainer): void {
  const client = getCurrentHub().getClient();

  try {
    const textEncoder = new TextEncoder();

    const options: ExtendedNetworkBreadcrumbsOptions = {
      replay,
      textEncoder,
    };

    if (client && client.on) {
      client.on('beforeAddBreadcrumb', (breadcrumb, hint) => beforeAddNetworkBreadcrumb(options, breadcrumb, hint));
    } else {
      // Fallback behavior
      addInstrumentationHandler('fetch', handleFetchSpanListener(replay));
      addInstrumentationHandler('xhr', handleXhrSpanListener(replay));
    }
  } catch {
    // Do nothing
  }
}

/** just exported for tests */
export function beforeAddNetworkBreadcrumb(
  options: ExtendedNetworkBreadcrumbsOptions,
  breadcrumb: Breadcrumb,
  hint?: BreadcrumbHint,
): void {
  if (!breadcrumb.data) {
    return;
  }

  try {
    if (_isXhrBreadcrumb(breadcrumb) && _isXhrHint(hint)) {
      _handleXhrBreadcrumb(breadcrumb, hint, options);
    }

    if (_isFetchBreadcrumb(breadcrumb) && _isFetchHint(hint)) {
      // This has to be sync, as we need to ensure the breadcrumb is enriched in the same tick
      // Because the hook runs synchronously, and the breadcrumb is afterwards passed on
      // So any async mutations to it will not be reflected in the final breadcrumb
      _enrichFetchBreadcrumb(breadcrumb, hint, options);

      void _handleFetchBreadcrumb(breadcrumb, hint, options);
    }
  } catch (e) {
    __DEBUG_BUILD__ && logger.warn('Error when enriching network breadcrumb');
  }
}

function _handleXhrBreadcrumb(
  breadcrumb: Breadcrumb & { data: XhrBreadcrumbData },
  hint: XhrHint,
  options: ExtendedNetworkBreadcrumbsOptions,
): void {
  // Enriches the breadcrumb overall
  _enrichXhrBreadcrumb(breadcrumb, hint, options);

  // Create a replay performance entry from this breadcrumb
  const result = _makeNetworkReplayBreadcrumb('resource.xhr', breadcrumb, hint);
  addNetworkBreadcrumb(options.replay, result);
}

async function _handleFetchBreadcrumb(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: FetchHint,
  options: ExtendedNetworkBreadcrumbsOptions,
): Promise<void> {
  const fullBreadcrumb = await _parseFetchResponse(breadcrumb, hint, options);

  // Create a replay performance entry from this breadcrumb
  const result = _makeNetworkReplayBreadcrumb('resource.fetch', fullBreadcrumb, hint);
  addNetworkBreadcrumb(options.replay, result);
}

// This does async operations on the breadcrumb for replay
async function _parseFetchResponse(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: FetchBreadcrumbHint,
  options: ExtendedNetworkBreadcrumbsOptions,
): Promise<Breadcrumb & { data: FetchBreadcrumbData }> {
  if (breadcrumb.data.response_body_size || !hint.response) {
    return breadcrumb;
  }

  // If no Content-Length header exists, we try to get the size from the response body
  try {
    // We have to clone this, as the body can only be read once
    const response = (hint.response as Response).clone();
    const body = await response.text();

    if (body.length) {
      return {
        ...breadcrumb,
        data: { ...breadcrumb.data, response_body_size: getBodySize(body, options.textEncoder) },
      };
    }
  } catch {
    // just ignore if something fails here
  }

  return breadcrumb;
}

function _makeNetworkReplayBreadcrumb(
  type: string,
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData | XhrBreadcrumbData },
  hint: FetchBreadcrumbHint | XhrBreadcrumbHint,
): ReplayPerformanceEntry<NetworkRequestData> | null {
  const { startTimestamp, endTimestamp } = hint;

  if (!endTimestamp) {
    return null;
  }

  const {
    url,
    method,
    status_code: statusCode,
    request_body_size: requestBodySize,
    response_body_size: responseBodySize,
  } = breadcrumb.data;

  if (url === undefined) {
    return null;
  }

  const result: ReplayPerformanceEntry<NetworkRequestData> = {
    type,
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    name: url,
    data: {
      method,
      statusCode,
    },
  };

  if (requestBodySize) {
    result.data.requestBodySize = requestBodySize;
  }
  if (responseBodySize) {
    result.data.responseBodySize = responseBodySize;
  }

  return result;
}

function _enrichXhrBreadcrumb(
  breadcrumb: Breadcrumb & { data: XhrBreadcrumbData },
  hint: XhrHint,
  options: ExtendedNetworkBreadcrumbsOptions,
): void {
  const { xhr, input } = hint;

  const reqSize = getBodySize(input, options.textEncoder);
  const resSize = xhr.getResponseHeader('content-length')
    ? parseContentSizeHeader(xhr.getResponseHeader('content-length'))
    : getBodySize(xhr.response, options.textEncoder);

  if (reqSize !== undefined) {
    breadcrumb.data.request_body_size = reqSize;
  }
  if (resSize !== undefined) {
    breadcrumb.data.response_body_size = resSize;
  }
}

function _enrichFetchBreadcrumb(
  breadcrumb: Breadcrumb & { data: FetchBreadcrumbData },
  hint: FetchHint,
  options: ExtendedNetworkBreadcrumbsOptions,
): void {
  const { input, response } = hint;

  const body = getFetchBody(input);
  const reqSize = getBodySize(body, options.textEncoder);
  const resSize = response ? parseContentSizeHeader(response.headers.get('content-length')) : undefined;

  if (reqSize !== undefined) {
    breadcrumb.data.request_body_size = reqSize;
  }
  if (resSize !== undefined) {
    breadcrumb.data.response_body_size = resSize;
  }
}

/** only exported for tests */
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
      // This is a bit simplified, but gives us a decent estimate
      // This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'
      // @ts-ignore passing FormData to URLSearchParams actually works
      const formDataStr = new URLSearchParams(body).toString();
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

/** only exported for tests */
export function parseContentSizeHeader(header: string | null | undefined): number | undefined {
  if (!header) {
    return undefined;
  }

  const size = parseInt(header, 10);
  return isNaN(size) ? undefined : size;
}

function getFetchBody(fetchArgs: unknown[] = []): RequestInit['body'] | undefined {
  // We only support getting the body from the fetch options
  if (fetchArgs.length !== 2 || typeof fetchArgs[1] !== 'object') {
    return undefined;
  }

  return (fetchArgs[1] as RequestInit).body;
}

function _isXhrBreadcrumb(breadcrumb: Breadcrumb): breadcrumb is Breadcrumb & { data: XhrBreadcrumbData } {
  return breadcrumb.category === 'xhr';
}

function _isFetchBreadcrumb(breadcrumb: Breadcrumb): breadcrumb is Breadcrumb & { data: FetchBreadcrumbData } {
  return breadcrumb.category === 'fetch';
}

function _isXhrHint(hint?: BreadcrumbHint): hint is XhrHint {
  return hint && hint.xhr;
}

function _isFetchHint(hint?: BreadcrumbHint): hint is FetchHint {
  return hint && hint.response;
}
