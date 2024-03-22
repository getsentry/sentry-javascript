import type { ErrorEvent, Event, TransactionEvent, TransportMakeRequestResponse } from '@sentry/types';

import type { ReplayContainer } from '../types';
import { isErrorEvent, isTransactionEvent } from '../util/eventUtils';

type AfterSendEventCallback = (event: Event, sendResponse: TransportMakeRequestResponse) => void;

/**
 * Returns a listener to be added to `client.on('afterSendErrorEvent, listener)`.
 */
export function handleAfterSendEvent(replay: ReplayContainer): AfterSendEventCallback {
  return (event: Event, sendResponse: TransportMakeRequestResponse) => {
    if (!replay.isEnabled() || (!isErrorEvent(event) && !isTransactionEvent(event))) {
      return;
    }

    const statusCode = sendResponse && sendResponse.statusCode;

    // We only want to do stuff on successful error sending, otherwise you get error replays without errors attached
    // If not using the base transport, we allow `undefined` response (as a custom transport may not implement this correctly yet)
    // If we do use the base transport, we skip if we encountered an non-OK status code
    if (!statusCode || statusCode < 200 || statusCode >= 300) {
      return;
    }

    if (isTransactionEvent(event)) {
      handleTransactionEvent(replay, event);
      return;
    }

    handleErrorEvent(replay, event);
  };
}

function handleTransactionEvent(replay: ReplayContainer, event: TransactionEvent): void {
  const replayContext = replay.getContext();

  // Collect traceIds in _context regardless of `recordingMode`
  // In error mode, _context gets cleared on every checkout
  // We limit to max. 100 transactions linked
  if (event.contexts && event.contexts.trace && event.contexts.trace.trace_id && replayContext.traceIds.size < 100) {
    replayContext.traceIds.add(event.contexts.trace.trace_id as string);
  }
}

function handleErrorEvent(replay: ReplayContainer, event: ErrorEvent): void {
  const replayContext = replay.getContext();

  // Add error to list of errorIds of replay. This is ok to do even if not
  // sampled because context will get reset at next checkout.
  // XXX: There is also a race condition where it's possible to capture an
  // error to Sentry before Replay SDK has loaded, but response returns after
  // it was loaded, and this gets called.
  // We limit to max. 100 errors linked
  if (event.event_id && replayContext.errorIds.size < 100) {
    replayContext.errorIds.add(event.event_id);
  }

  // If error event is tagged with replay id it means it was sampled (when in buffer mode)
  // Need to be very careful that this does not cause an infinite loop
  if (replay.recordingMode !== 'buffer' || !event.tags || !event.tags.replayId) {
    return;
  }

  const { beforeErrorSampling } = replay.getOptions();
  if (typeof beforeErrorSampling === 'function' && !beforeErrorSampling(event)) {
    return;
  }

  setTimeout(() => {
    // Capture current event buffer as new replay
    // This should never reject
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    replay.sendBufferedReplayOrFlush();
  });
}
