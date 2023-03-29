import type { Breadcrumb, TextEncoderInternal, XhrBreadcrumbData } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { ReplayContainer, ReplayNetworkRequestData, XhrHint } from '../../types';
import { addNetworkBreadcrumb } from './addNetworkBreadcrumb';
import {
  buildNetworkRequestOrResponse,
  getBodySize,
  getBodyString,
  getNetworkBody,
  makeNetworkReplayBreadcrumb,
  parseContentLengthHeader,
} from './networkUtils';

/**
 * Capture an XHR breadcrumb to a replay.
 * This adds additional data (where approriate).
 */
export async function captureXhrBreadcrumbToReplay(
  breadcrumb: Breadcrumb & { data: XhrBreadcrumbData },
  hint: XhrHint,
  options: { replay: ReplayContainer; captureBodies: boolean },
): Promise<void> {
  try {
    const data = _prepareXhrData(breadcrumb, hint, options);

    // Create a replay performance entry from this breadcrumb
    const result = makeNetworkReplayBreadcrumb('resource.xhr', data);
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
export function enrichXhrBreadcrumb(
  breadcrumb: Breadcrumb & { data: XhrBreadcrumbData },
  hint: XhrHint,
  options: { textEncoder: TextEncoderInternal },
): void {
  const { xhr, input } = hint;

  const reqSize = getBodySize(input, options.textEncoder);
  const resSize = xhr.getResponseHeader('content-length')
    ? parseContentLengthHeader(xhr.getResponseHeader('content-length'))
    : getBodySize(xhr.response, options.textEncoder);

  if (reqSize !== undefined) {
    breadcrumb.data.request_body_size = reqSize;
  }
  if (resSize !== undefined) {
    breadcrumb.data.response_body_size = resSize;
  }
}

function _prepareXhrData(
  breadcrumb: Breadcrumb & { data: XhrBreadcrumbData },
  hint: XhrHint,
  options: { captureBodies: boolean },
): ReplayNetworkRequestData | null {
  const { startTimestamp, endTimestamp, input } = hint;

  const {
    url,
    method,
    status_code: statusCode,
    request_body_size: requestBodySize,
    response_body_size: responseBodySize,
  } = breadcrumb.data;

  if (!url) {
    return null;
  }

  const request = buildNetworkRequestOrResponse(
    requestBodySize,
    options.captureBodies ? getNetworkBody(getBodyString(input)) : undefined,
  );
  const response = buildNetworkRequestOrResponse(
    responseBodySize,
    options.captureBodies ? getNetworkBody(hint.xhr.responseText) : undefined,
  );

  return {
    startTimestamp,
    endTimestamp,
    url,
    method,
    statusCode: statusCode || 0,
    request,
    response,
  };
}
