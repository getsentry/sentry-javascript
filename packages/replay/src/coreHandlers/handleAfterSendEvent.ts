import { getCurrentHub } from '@sentry/core';
import type { Event, Transport, TransportMakeRequestResponse } from '@sentry/types';

import { UNABLE_TO_SEND_REPLAY } from '../constants';
import type { ReplayContainer } from '../types';
import { isErrorEvent, isTransactionEvent } from '../util/eventUtils';

type AfterSendEventCallback = (event: Event, sendResponse: TransportMakeRequestResponse | void) => void;

/**
 * Returns a listener to be added to `client.on('afterSendErrorEvent, listener)`.
 */
export function handleAfterSendEvent(replay: ReplayContainer): AfterSendEventCallback {
  // Custom transports may still be returning `Promise<void>`, which means we cannot expect the status code to be available there
  // TODO (v8): remove this check as it will no longer be necessary
  const enforceStatusCode = isBaseTransportSend();

  return (event: Event, sendResponse: TransportMakeRequestResponse | void) => {
    if (!isErrorEvent(event) && !isTransactionEvent(event)) {
      return;
    }

    const statusCode = sendResponse && sendResponse.statusCode;

    // We only want to do stuff on successful error sending, otherwise you get error replays without errors attached
    // If not using the base transport, we allow `undefined` response (as a custom transport may not implement this correctly yet)
    // If we do use the base transport, we skip if we encountered an non-OK status code
    if (enforceStatusCode && (!statusCode || statusCode < 200 || statusCode >= 300)) {
      return;
    }

    // Collect traceIds in _context regardless of `recordingMode`
    // In error mode, _context gets cleared on every checkout
    if (isTransactionEvent(event) && event.contexts && event.contexts.trace && event.contexts.trace.trace_id) {
      replay.getContext().traceIds.add(event.contexts.trace.trace_id as string);
      return;
    }

    // Everything below is just for error events
    if (!isErrorEvent(event)) {
      return;
    }

    // Add error to list of errorIds of replay
    if (event.event_id) {
      replay.getContext().errorIds.add(event.event_id);
    }

    // Trigger error recording
    // Need to be very careful that this does not cause an infinite loop
    if (
      replay.recordingMode === 'error' &&
      event.exception &&
      event.message !== UNABLE_TO_SEND_REPLAY // ignore this error because otherwise we could loop indefinitely with trying to capture replay and failing
    ) {
      setTimeout(() => {
        // Capture current event buffer as new replay
        void replay.sendBufferedReplayOrFlush();
      });
    }
  };
}

function isBaseTransportSend(): boolean {
  const client = getCurrentHub().getClient();
  if (!client) {
    return false;
  }

  const transport = client.getTransport();
  if (!transport) {
    return false;
  }

  return (
    (transport.send as Transport['send'] & { __sentry__baseTransport__?: true }).__sentry__baseTransport__ || false
  );
}
