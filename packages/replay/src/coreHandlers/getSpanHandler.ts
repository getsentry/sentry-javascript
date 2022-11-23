import { InstrumentationTypeSpan } from '../types';
import { handleFetch } from './handleFetch';
import { handleHistory } from './handleHistory';
import { handleXhr } from './handleXhr';

// TODO: Add return type
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function getSpanHandler(type: InstrumentationTypeSpan) {
  if (type === 'fetch') {
    return handleFetch;
  }

  if (type === 'xhr') {
    return handleXhr;
  }

  return handleHistory;
}
