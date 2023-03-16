import type { HandlerDataFetch } from '@sentry/types';

import type { ReplayContainer, ReplayPerformanceEntry } from '../types';
import { createPerformanceSpans } from '../util/createPerformanceSpans';
import { shouldFilterRequest } from '../util/shouldFilterRequest';

/** only exported for tests */
export function handleFetch(handlerData: HandlerDataFetch): null | ReplayPerformanceEntry {
  const { startTimestamp, endTimestamp, fetchData, response } = handlerData;

  if (!endTimestamp) {
    return null;
  }

  const { method, request_body_size: requestBodySize, response_body_size: responseBodySize } = fetchData;

  return {
    type: 'resource.fetch',
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    name: fetchData.url,
    data: {
      method,
      statusCode: response && (response as Response).status,
      requestBodySize,
      responseBodySize,
    },
  };
}

/**
 * Returns a listener to be added to `addInstrumentationHandler('fetch', listener)`.
 */
export function handleFetchSpanListener(replay: ReplayContainer): (handlerData: HandlerDataFetch) => void {
  return (handlerData: HandlerDataFetch) => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleFetch(handlerData);

    if (result === null) {
      return;
    }

    if (shouldFilterRequest(replay, result.name)) {
      return;
    }

    replay.addUpdate(() => {
      createPerformanceSpans(replay, [result]);
      // Returning true will cause `addUpdate` to not flush
      // We do not want network requests to cause a flush. This will prevent
      // recurring/polling requests from keeping the replay session alive.
      return true;
    });
  };
}
