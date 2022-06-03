import { ReplaySpan } from '@/types';

export function handleFetch(handlerData: any): ReplaySpan {
  // TODO: add status code into data, etc.

  if (!handlerData.endTimestamp) {
    return null;
  }

  return {
    description: handlerData.args[1],
    op: handlerData.args[0],
    startTimestamp: handlerData.startTimestamp / 1000,
    endTimestamp: handlerData.endTimestamp / 1000,
  };
}
