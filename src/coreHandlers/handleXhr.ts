import { ReplaySpan } from '@/types';

export function handleXhr(handlerData: any): ReplaySpan {
  if (handlerData.startTimestamp) {
    handlerData.xhr.__sentry_xhr__.startTimestamp = handlerData.startTimestamp;
  }

  if (!handlerData.endTimestamp) {
    return null;
  }

  const [op, description] = handlerData.args;

  return {
    description,
    op,
    startTimestamp:
      handlerData.xhr.__sentry_xhr__.startTimestamp / 1000 ||
      handlerData.endTimestamp / 1000.0,
    endTimestamp: handlerData.endTimestamp / 1000.0,
    data: {
      statusCode: handlerData.response.status,
    },
  };
}
