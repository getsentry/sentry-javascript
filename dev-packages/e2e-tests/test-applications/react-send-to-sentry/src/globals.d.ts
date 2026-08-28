interface RecordedEvent {
  eventId: string;
  traceId: string;
  op?: string;
}

interface Window {
  recordedTransactions?: RecordedEvent[];
  capturedException?: RecordedEvent;
  sentryReplayId?: string;
}
