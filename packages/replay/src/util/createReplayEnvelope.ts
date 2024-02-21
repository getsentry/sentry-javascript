import type { DsnComponents, ReplayEnvelope, ReplayEvent, ReplayRecordingData } from '@sentry/types';
import { createEnvelope, createEventEnvelopeHeaders, getSdkMetadataForEnvelopeHeader } from '@sentry/utils';

/**
 * Create a replay envelope ready to be sent.
 * This includes both the replay event, as well as the recording data.
 */
export function createReplayEnvelope(
  replayEvent: ReplayEvent,
  recordingData: ReplayRecordingData,
  dsn: DsnComponents,
  tunnel?: string,
): ReplayEnvelope {
  return createEnvelope<ReplayEnvelope>(
    createEventEnvelopeHeaders(replayEvent, getSdkMetadataForEnvelopeHeader(replayEvent), tunnel, dsn),
    [
      [{ type: 'replay_event' }, replayEvent],
      [
        {
          type: 'replay_recording',
          // If string then we need to encode to UTF8, otherwise will have
          // wrong size. TextEncoder has similar browser support to
          // MutationObserver, although it does not accept IE11.
          length:
            typeof recordingData === 'string' ? new TextEncoder().encode(recordingData).length : recordingData.length,
        },
        recordingData,
      ],
    ],
  );
}
