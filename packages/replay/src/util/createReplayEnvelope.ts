import { Envelope, Event } from '@sentry/types';
import { createEnvelope } from '@sentry/utils';

import { REPLAY_SDK_INFO } from '../constants';

export function createReplayEnvelope(
  replayId: string,
  replayEvent: Event,
  payloadWithSequence: string | Uint8Array,
): Envelope {
  return createEnvelope(
    {
      event_id: replayId,
      sent_at: new Date().toISOString(),
      sdk: REPLAY_SDK_INFO,
    },
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
