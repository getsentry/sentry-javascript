import { DsnComponents, Envelope, ReplayEvent, ReplayRecordingData } from '@sentry/types';
import { createEnvelope, createEventEnvelopeHeaders, getSdkMetadataForEnvelopeHeader } from '@sentry/utils';

export function createReplayEnvelope(
  replayEvent: ReplayEvent,
  payloadWithSequence: ReplayRecordingData,
  dsn: DsnComponents,
  tunnel?: string,
): Envelope {
  return createEnvelope(
    createEventEnvelopeHeaders(replayEvent, getSdkMetadataForEnvelopeHeader(replayEvent), tunnel, dsn),
    [
      // @ts-ignore New types
      [{ type: 'replay_event' }, replayEvent],
      [
        {
          // @ts-ignore setting envelope
          type: 'replay_recording',
          length: payloadWithSequence.length,
        },
        // @ts-ignore: Type 'string' is not assignable to type 'ClientReport'.ts(2322)
        payloadWithSequence,
      ],
    ],
  );
}
