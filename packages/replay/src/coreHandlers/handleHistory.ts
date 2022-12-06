import { ReplayPerformanceEntry } from '../createPerformanceEntry';
import { ReplayContainer } from '../replay';

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

export function handleHistorySpanListener(replay: ReplayContainer): (handlerData: HistoryHandlerData) => void {
  return (handlerData: HistoryHandlerData) => {
    // @ts-ignore private
    if (!replay._isEnabled) {
      return;
    }

    const result = handleHistory(handlerData);

    if (result === null) {
      return;
    }

    // Need to collect visited URLs
    // @ts-ignore private
    replay._context.urls.push(result.name);
    replay.triggerUserActivity();

    replay.addUpdate(() => {
      void replay.createPerformanceSpans([result]);
      // Returning false to flush
      return false;
    });
  };
}
