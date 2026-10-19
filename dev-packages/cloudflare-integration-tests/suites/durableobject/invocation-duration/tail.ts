interface Invocation {
  trigger: string;
  durationMs: number;
}

const invocations: Invocation[] = [];

export default {
  async tail(events: TraceItem[]): Promise<void> {
    // `wallTime` is always 0 in local dev, so the duration ends when the tail event arrives.
    const receivedAt = Date.now();

    for (const { event, eventTimestamp, executionModel } of events) {
      if (executionModel !== 'durableObject' || !event || eventTimestamp === null) {
        continue;
      }

      const trigger = 'rpcMethod' in event ? event.rpcMethod : 'scheduledTime' in event ? 'alarm' : 'fetch';
      invocations.push({ trigger, durationMs: receivedAt - eventTimestamp });
    }
  },

  async fetch(): Promise<Response> {
    return Response.json(invocations);
  },
} satisfies ExportedHandler;
