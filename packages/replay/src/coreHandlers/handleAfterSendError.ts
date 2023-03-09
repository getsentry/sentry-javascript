import { getCurrentHub } from '@sentry/core';
import type { ErrorEvent, Transport, TransportMakeRequestResponse } from '@sentry/types';

import { UNABLE_TO_SEND_REPLAY } from '../constants';
import type { ReplayContainer } from '../types';

/**
 * Returns a listener to be added to `client.on('afterSendErrorEvent, listener)`.
 */
export function handleAfterSendError(
  replay: ReplayContainer,
): (event: ErrorEvent, sendResponse: TransportMakeRequestResponse | void) => void {
  // Custom transports may still be returning `Promise<void>`, which means we cannot expect the status code to be available there
  const enforceStatusCode = isBaseTransportSend();

  return (event: ErrorEvent, sendResponse: TransportMakeRequestResponse | void) => {
    const statusCode = sendResponse && sendResponse.statusCode;

    // We only want to do stuff on successfull error sending, otherwise you get error replays without errors attached
    // If not using the base transport, we allow `undefined` response (as a custom transport may not implement this correctly yet)
    // If we do use the base transport, we skip if we encountered an non-OK status code
    if (enforceStatusCode && (!statusCode || statusCode < 200 || statusCode >= 300)) {
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
      setTimeout(async () => {
        // Allow flush to complete before resuming as a session recording, otherwise
        // the checkout from `startRecording` may be included in the payload.
        // Prefer to keep the error replay as a separate (and smaller) segment
        // than the session replay.
        await replay.flushImmediate();

        if (replay.stopRecording()) {
          // Reset all "capture on error" configuration before
          // starting a new recording
          replay.recordingMode = 'session';
          replay.startRecording();
        }
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
