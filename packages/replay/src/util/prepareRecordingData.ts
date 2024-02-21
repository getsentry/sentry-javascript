import type { ReplayRecordingData } from '@sentry/types';

/**
 * Prepare the recording data ready to be sent.
 */
export function prepareRecordingData({
  recordingData,
  headers,
}: {
  recordingData: ReplayRecordingData;
  headers: Record<string, unknown>;
}): ReplayRecordingData {
  let payloadWithSequence;

  // XXX: newline is needed to separate sequence id from events
  const replayHeaders = `${JSON.stringify(headers)}
`;

  if (typeof recordingData === 'string') {
    payloadWithSequence = `${replayHeaders}${recordingData}`;
  } else {
    const enc = new TextEncoder();
    // XXX: newline is needed to separate sequence id from events
    const sequence = enc.encode(replayHeaders);
    // Merge the two Uint8Arrays
    payloadWithSequence = new Uint8Array(sequence.length + recordingData.length);
    payloadWithSequence.set(sequence);
    payloadWithSequence.set(recordingData, sequence.length);
  }

  return payloadWithSequence;
}
