import { flush } from '@sentry/node';
import { logger } from '@sentry/utils';
import type { RequestEvent } from 'solid-js/web';
import { DEBUG_BUILD } from '../common/debug-build';

/** Flush the event queue to ensure that events get sent to Sentry before the response is finished and the lambda ends */
export async function flushIfServerless(): Promise<void> {
  const isServerless = !!process.env.LAMBDA_TASK_ROOT || !!process.env.VERCEL;

  if (isServerless) {
    try {
      DEBUG_BUILD && logger.log('Flushing events...');
      await flush(2000);
      DEBUG_BUILD && logger.log('Done flushing events');
    } catch (e) {
      DEBUG_BUILD && logger.log('Error while flushing events:\n', e);
    }
  }
}

/**
 * Takes a request event and extracts traceparent and DSC data
 * from the `sentry-trace` and `baggage` DSC headers.
 */
export function getTracePropagationData(event: RequestEvent | undefined): {
  sentryTrace: string | undefined;
  baggage: string | null;
} {
  const request = event && event.request;
  const headers = request && request.headers;
  const sentryTrace = (headers && headers.get('sentry-trace')) || undefined;
  const baggage = (headers && headers.get('baggage')) || null;

  return { sentryTrace, baggage };
}

/**
 * Determines if a thrown "error" is a redirect Response which Solid Start users can throw to redirect to another route.
 * see: https://docs.solidjs.com/solid-router/reference/data-apis/response-helpers#redirect
 * @param error the potential redirect error
 */
export function isRedirect(error: unknown): boolean {
  if (error == null || !(error instanceof Response)) {
    return false;
  }

  const hasValidLocation = typeof error.headers.get('location') === 'string';
  const hasValidStatus = error.status >= 300 && error.status <= 308;
  return hasValidLocation && hasValidStatus;
}
