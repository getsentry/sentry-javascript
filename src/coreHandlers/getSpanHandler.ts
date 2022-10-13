import { InstrumentationTypeSpan } from '../types';

import { handleFetch } from './handleFetch';
import { handleHistory } from './handleHistory';
import { handleXhr } from './handleXhr';

export function getSpanHandler(type: InstrumentationTypeSpan) {
  if (type === 'fetch') {
    return handleFetch;
  }

  if (type === 'xhr') {
    return handleXhr;
  }

  return handleHistory;
}
