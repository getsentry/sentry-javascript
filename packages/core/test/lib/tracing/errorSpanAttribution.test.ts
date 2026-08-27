import { beforeEach, describe, expect, it } from 'vitest';
import { captureException, setAsyncContextStrategy, setCurrentClient, startNewTrace, startSpan } from '../../../src';
import type { Event } from '../../../src/types/event';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let client: TestClient;
let events: Event[];

describe('error span attribution', () => {
  beforeEach(() => {
    resetGlobals();
    setAsyncContextStrategy(undefined);

    events = [];

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1,
      beforeSend: event => {
        events.push(event);
        return event;
      },
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
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
      // which scope the stack strategy happens to leak after the branches resume.
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

  // The bail-out described in the design: an error that outlives its trace keeps today's
  // behaviour, so the event never mixes a stale trace with the current scope's data.
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
});
