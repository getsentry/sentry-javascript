import { ReplayPerformanceEntry } from '../createPerformanceEntry';

interface HistoryHandlerData {
  from: string;
  to: string;
}

export function handleHistory(handlerData: HistoryHandlerData): ReplayPerformanceEntry {
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
