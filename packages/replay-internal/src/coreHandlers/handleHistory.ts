import type { HandlerDataHistory } from '@sentry/types';

import type { HistoryData, ReplayContainer, ReplayPerformanceEntry } from '../types';
import { createPerformanceSpans } from '../util/createPerformanceSpans';

function handleHistory(handlerData: HandlerDataHistory): ReplayPerformanceEntry<HistoryData> {
  const { from, to } = handlerData;

  const now = Date.now() / 1000;

  return {
    type: 'navigation.push',
    start: now,
    end: now,
    name: to,
    data: {
      previous: from,
    },
  };
}

/**
 * Returns a listener to be added to `addHistoryInstrumentationHandler(listener)`.
 */
export function handleHistorySpanListener(replay: ReplayContainer): (handlerData: HandlerDataHistory) => void {
  return (handlerData: HandlerDataHistory) => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleHistory(handlerData);

    if (result === null) {
      return;
    }

    // Need to collect visited URLs
    replay.getContext().urls.push(result.name);
    replay.triggerUserActivity();

    replay.addUpdate(() => {
      createPerformanceSpans(replay, [result]);
      // Returning false to flush
      return false;
    });
  };
}
