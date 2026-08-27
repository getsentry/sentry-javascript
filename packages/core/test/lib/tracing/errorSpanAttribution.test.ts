import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureException,
  getActiveSpan,
  setAsyncContextStrategy,
  setCurrentClient,
  startNewTrace,
  startSpan,
} from '../../../src';
import type { Event } from '../../../src/types/event';
import type { TestClientOptions } from '../../mocks/client';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let client: TestClient;
let events: Event[];

function initClient(extraOptions: Partial<TestClientOptions> = {}): void {
  events = [];

  const options = getDefaultTestClientOptions({
    tracesSampleRate: 1,
    beforeSend: event => {
      // The test client strips `sdkProcessingMetadata` when it sends, so snapshot the event here.
      events.push({ ...event });
      return event;
    },
    ...extraOptions,
  });
  client = new TestClient(options);
  setCurrentClient(client);
  client.init();
}

describe('error span attribution', () => {
  beforeEach(() => {
    resetGlobals();
    setAsyncContextStrategy(undefined);
    initClient();
  });

  it('attributes an error to the span it escaped, not the span it was caught in', async () => {
    let innerSpanId: string | undefined;
    let outerSpanId: string | undefined;

    startSpan({ name: 'outer' }, outerSpan => {
      outerSpanId = outerSpan.spanContext().spanId;

      try {
        startSpan({ name: 'inner' }, innerSpan => {
          innerSpanId = innerSpan.spanContext().spanId;
          throw new Error('inner failed');
        });
      } catch (error) {
        captureException(error);
      }
    });

    await client.flush();

    expect(innerSpanId).not.toBe(outerSpanId);
    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.trace?.span_id).toBe(innerSpanId);
  });

  it('attributes an error to the failing branch of a concurrent group', async () => {
    let failingSpanId: string | undefined;
    let succeedingSpanId: string | undefined;
    let reportingSpanId: string | undefined;

    await startSpan({ name: 'root' }, async () => {
      let escapedError: unknown;

      try {
        await Promise.all([
          startSpan({ name: 'failing' }, async span => {
            failingSpanId = span.spanContext().spanId;
            await tick();
            throw new Error('branch failed');
          }),
          startSpan({ name: 'succeeding' }, async span => {
            succeedingSpanId = span.spanContext().spanId;
            await tick();
          }),
        ]);
      } catch (error) {
        escapedError = error;
      }

      // Report from a span that is unambiguously active, so the assertion does not depend on
      // which scope the stack strategy happens to leak once the branches resume.
      startSpan({ name: 'reporting' }, span => {
        reportingSpanId = span.spanContext().spanId;
        captureException(escapedError);
      });
    });

    await client.flush();

    expect(failingSpanId).not.toBe(succeedingSpanId);
    expect(failingSpanId).not.toBe(reportingSpanId);
    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.trace?.span_id).toBe(failingSpanId);
  });

  it('attributes an error captured with no active span, in the same trace', async () => {
    let escapedError: unknown;
    let escapedSpanId: string | undefined;

    try {
      startSpan({ name: 'failing' }, span => {
        escapedSpanId = span.spanContext().spanId;
        throw new Error('boom');
      });
    } catch (error) {
      escapedError = error;
    }

    expect(getActiveSpan()).toBeUndefined();
    captureException(escapedError);

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.trace?.span_id).toBe(escapedSpanId);
  });

  it('attributes an error to the deepest span it escaped', async () => {
    let deepestSpanId: string | undefined;

    startSpan({ name: 'level-1' }, () => {
      try {
        startSpan({ name: 'level-2' }, () => {
          startSpan({ name: 'level-3' }, span => {
            deepestSpanId = span.spanContext().spanId;
            throw new Error('level 3 failed');
          });
        });
      } catch (error) {
        captureException(error);
      }
    });

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.trace?.span_id).toBe(deepestSpanId);
  });

  // The stored span id is only meaningful inside its own trace, so an error that outlives its
  // trace keeps today's behaviour rather than mixing a stale trace into the current scope's data.
  it('does not attribute an error to a span from a previous trace', async () => {
    let escapedError: unknown;
    let currentTraceId: string | undefined;
    let currentSpanId: string | undefined;

    try {
      startSpan({ name: 'previous-trace' }, () => {
        throw new Error('escaped its trace');
      });
    } catch (error) {
      escapedError = error;
    }

    startNewTrace(() => {
      startSpan({ name: 'current-trace' }, span => {
        currentTraceId = span.spanContext().traceId;
        currentSpanId = span.spanContext().spanId;
        captureException(escapedError);
      });
    });

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.trace?.trace_id).toBe(currentTraceId);
    expect(events[0]?.contexts?.trace?.span_id).toBe(currentSpanId);
  });

  it('falls back to the active span when a non-object is thrown', async () => {
    let outerSpanId: string | undefined;

    startSpan({ name: 'outer' }, outerSpan => {
      outerSpanId = outerSpan.spanContext().spanId;

      try {
        startSpan({ name: 'inner' }, () => {
          throw 'a string, which cannot key a WeakMap';
        });
      } catch (error) {
        captureException(error);
      }
    });

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.trace?.span_id).toBe(outerSpanId);
  });

  it('does not attribute an error to an ignored span, which is never sent', async () => {
    initClient({ traceLifecycle: 'stream', ignoreSpans: ['ignored'] });

    let outerSpanId: string | undefined;

    startSpan({ name: 'outer' }, outerSpan => {
      outerSpanId = outerSpan.spanContext().spanId;

      try {
        startSpan({ name: 'ignored' }, () => {
          throw new Error('ignored span failed');
        });
      } catch (error) {
        captureException(error);
      }
    });

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.contexts?.trace?.span_id).toBe(outerSpanId);
  });

  // Why the attribution is gated on the trace: the envelope header is built from the dynamic
  // sampling context, so it must never name a different trace than the trace context does.
  it('keeps the dynamic sampling context in agreement with the trace context', async () => {
    startSpan({ name: 'outer' }, () => {
      try {
        startSpan({ name: 'inner' }, () => {
          throw new Error('inner failed');
        });
      } catch (error) {
        captureException(error);
      }
    });

    await client.flush();

    const traceContext = events[0]?.contexts?.trace;
    expect(traceContext?.trace_id).toBeDefined();
    expect(events[0]?.sdkProcessingMetadata?.dynamicSamplingContext?.trace_id).toBe(traceContext?.trace_id);
  });
});
