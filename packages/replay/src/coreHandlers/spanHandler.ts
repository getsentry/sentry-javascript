import { ReplayPerformanceEntry } from '../createPerformanceEntry';
import { InstrumentationTypeSpan } from '../types';
import { FetchHandlerData, handleFetch } from './handleFetch';
import { handleHistory, HistoryHandlerData } from './handleHistory';
import { handleXhr, XhrHandlerData } from './handleXhr';

export function spanHandler(type: InstrumentationTypeSpan, handlerData: unknown): null | ReplayPerformanceEntry {
  if (type === 'fetch') {
    return handleFetch(handlerData as FetchHandlerData);
  }

  if (type === 'xhr') {
    return handleXhr(handlerData as XhrHandlerData);
  }

  return handleHistory(handlerData as HistoryHandlerData);
}
