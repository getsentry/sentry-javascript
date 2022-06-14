import { ReplaySpan } from '@/types';
import { getCurrentHub } from '@sentry/browser';

export function handleFetch(handlerData: any): ReplaySpan {
  if (!handlerData.endTimestamp) {
    return null;
  }

  const [op, description] = handlerData.args;

  return {
    description,
    op,
    startTimestamp: handlerData.startTimestamp / 1000,
    endTimestamp: handlerData.endTimestamp / 1000,
    data: {
      statusCode: handlerData.response.status,
    },
  };
}
