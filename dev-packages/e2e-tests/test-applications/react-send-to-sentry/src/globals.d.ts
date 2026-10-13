interface RecordedEvent {
  eventId: string;
  traceId: string;
  op?: string;
}

/** A streamed segment span, identified by its span id rather than an event id. */
interface RecordedSpan {
  spanId: string;
  traceId: string;
  op?: string;
}

interface Window {
  recordedSegmentSpans?: RecordedSpan[];
  capturedException?: RecordedEvent;
  sentryReplayId?: string;
}
