import type { HandlerDataFetch } from '@sentry/types';

import type { NetworkRequestData, ReplayContainer, ReplayPerformanceEntry } from '../types';
import { addNetworkBreadcrumb } from './util/addNetworkBreadcrumb';

/** only exported for tests */
export function handleFetch(handlerData: HandlerDataFetch): null | ReplayPerformanceEntry<NetworkRequestData> {
  const { startTimestamp, endTimestamp, fetchData, response } = handlerData;

  if (!endTimestamp) {
    return null;
  }

  // This is only used as a fallback, so we know the body sizes are never set here
  const { method, url } = fetchData;

  return {
    type: 'resource.fetch',
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    name: url,
    data: {
      method,
      statusCode: response ? (response as Response).status : undefined,
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

    addNetworkBreadcrumb(replay, result);
  };
}
