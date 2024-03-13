import { flush } from '@sentry/node';
import { logger } from '@sentry/utils';
import type { RequestEvent } from '@sveltejs/kit';

import { DEBUG_BUILD } from '../common/debug-build';

/**
 * Takes a request event and extracts traceparent and DSC data
 * from the `sentry-trace` and `baggage` DSC headers.
 *
 * Sets propagation context as a side effect.
 */
export function getTracePropagationData(event: RequestEvent): { sentryTrace: string; baggage: string | null } {
  const sentryTrace = event.request.headers.get('sentry-trace') || '';
  const baggage = event.request.headers.get('baggage');

  return { sentryTrace, baggage };
}

/** Flush the event queue to ensure that events get sent to Sentry before the response is finished and the lambda ends */
export async function flushIfServerless(): Promise<void> {
  const platformSupportsStreaming = !process.env.LAMBDA_TASK_ROOT && !process.env.VERCEL;

  if (!platformSupportsStreaming) {
    try {
      DEBUG_BUILD && logger.log('Flushing events...');
      await flush(2000);
      DEBUG_BUILD && logger.log('Done flushing events');
    } catch (e) {
      DEBUG_BUILD && logger.log('Error while flushing events:\n', e);
    }
  }
}
