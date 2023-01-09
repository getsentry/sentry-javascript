import type { ReplayContainer, ReplayPerformanceEntry } from '../types';
import { createPerformanceSpans } from '../util/createPerformanceSpans';

interface HistoryHandlerData {
  from: string;
  to: string;
}

function handleHistory(handlerData: HistoryHandlerData): ReplayPerformanceEntry {
  const { from, to } = handlerData;

  const now = new Date().getTime() / 1000;

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
 * Returns a listener to be added to `addInstrumentationHandler('history', listener)`.
 */
export function handleHistorySpanListener(replay: ReplayContainer): (handlerData: HistoryHandlerData) => void {
  return (handlerData: HistoryHandlerData) => {
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
