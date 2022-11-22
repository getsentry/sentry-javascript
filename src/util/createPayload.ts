import { RecordedEvents } from '../types';

export function createPayload({
  events,
  headers,
}: {
  events: RecordedEvents;
  headers: Record<string, any>;
}): string | Uint8Array {
  let payloadWithSequence;

  // XXX: newline is needed to separate sequence id from events
  const replayHeaders = `${JSON.stringify(headers)}
`;

  if (typeof events === 'string') {
    payloadWithSequence = `${replayHeaders}${events}`;
  } else {
    const enc = new TextEncoder();
    // XXX: newline is needed to separate sequence id from events
    const sequence = enc.encode(replayHeaders);
    // Merge the two Uint8Arrays
    payloadWithSequence = new Uint8Array(sequence.length + events.length);
    payloadWithSequence.set(sequence);
    payloadWithSequence.set(events, sequence.length);
  }

  return payloadWithSequence;
}
