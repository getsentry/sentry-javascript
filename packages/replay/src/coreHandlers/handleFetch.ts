import type { ReplayContainer, ReplayPerformanceEntry } from '../types';
import { createPerformanceSpans } from '../util/createPerformanceSpans';
import { shouldFilterRequest } from '../util/shouldFilterRequest';

interface FetchHandlerData {
  args: Parameters<typeof fetch>;
  fetchData: {
    method: string;
    url: string;
  };
  response: {
    type: string;
    url: string;
    redirected: boolean;
    status: number;
    ok: boolean;
  };
  startTimestamp: number;
  endTimestamp?: number;
}

/** only exported for tests */
export function handleFetch(handlerData: FetchHandlerData): null | ReplayPerformanceEntry {
  if (!handlerData.endTimestamp) {
    return null;
  }

  const { startTimestamp, endTimestamp, fetchData, response } = handlerData;

  return {
    type: 'resource.fetch',
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    name: fetchData.url,
    data: {
      method: fetchData.method,
      statusCode: response.status,
    },
  };
}

/**
 * Returns a listener to be added to `addInstrumentationHandler('fetch', listener)`.
 */
export function handleFetchSpanListener(replay: ReplayContainer): (handlerData: FetchHandlerData) => void {
  return (handlerData: FetchHandlerData) => {
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
