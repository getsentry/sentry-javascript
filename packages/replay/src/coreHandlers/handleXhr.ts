import type { HandlerDataXhr } from '@sentry/types';
import { SENTRY_XHR_DATA_KEY } from '@sentry/utils';

import type { NetworkRequestData, ReplayContainer, ReplayPerformanceEntry } from '../types';
import { addNetworkBreadcrumb } from './util/addNetworkBreadcrumb';

/** only exported for tests */
export function handleXhr(handlerData: HandlerDataXhr): ReplayPerformanceEntry<NetworkRequestData> | null {
  const { startTimestamp, endTimestamp, xhr } = handlerData;

  const sentryXhrData = xhr[SENTRY_XHR_DATA_KEY];

  if (!startTimestamp || !endTimestamp || !sentryXhrData) {
    return null;
  }

  // This is only used as a fallback, so we know the body sizes are never set here
  const { method, url, status_code: statusCode } = sentryXhrData;

  if (url === undefined) {
    return null;
  }

  return {
    type: 'resource.xhr',
    name: url,
    start: startTimestamp / 1000,
    end: endTimestamp / 1000,
    data: {
      method,
      statusCode,
    },
  };
}

/**
 * Returns a listener to be added to `addInstrumentationHandler('xhr', listener)`.
 */
export function handleXhrSpanListener(replay: ReplayContainer): (handlerData: HandlerDataXhr) => void {
  return (handlerData: HandlerDataXhr) => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleXhr(handlerData);

    addNetworkBreadcrumb(replay, result);
  };
}
