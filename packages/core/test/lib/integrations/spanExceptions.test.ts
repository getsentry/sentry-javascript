import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureException,
  setAsyncContextStrategy,
  setCurrentClient,
  startInactiveSpan,
  startSpan,
  suppressTracing,
} from '../../../src';
import { spanExceptionsIntegration } from '../../../src/integrations/spanExceptions';
import type { Event } from '../../../src/types/event';
import type { TestClientOptions } from '../../mocks/client';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { resetGlobals } from '../../testutils';

let client: TestClient;
let events: Event[];

function initClient(extraOptions: Partial<TestClientOptions> = {}): void {
  events = [];

  client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      integrations: [spanExceptionsIntegration()],
      beforeSend: event => {
        events.push(event);
        return event;
      },
      ...extraOptions,
    }),
  );
  setCurrentClient(client);
  client.init();
}

describe('spanExceptionsIntegration', () => {
  beforeEach(() => {
    resetGlobals();
    setAsyncContextStrategy(undefined);
  });

  it('captures an exception recorded on a span as an error linked to that span', async () => {
    initClient();
    const error = new Error('Connection terminated unexpectedly');

    const span = startInactiveSpan({ name: 'SELECT * FROM users WHERE id = $1' });
    span.recordException(error);
    span.end();

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values).toEqual([
      {
        type: 'Error',
        value: 'Connection terminated unexpectedly',
        mechanism: { type: 'auto.core.span_exceptions', handled: true },
      },
    ]);
    expect(events[0]?.contexts?.trace?.trace_id).toBe(span.spanContext().traceId);
    expect(events[0]?.contexts?.trace?.span_id).toBe(span.spanContext().spanId);
  });

  it('captures an exception recorded on a non-recording span', async () => {
    initClient({ tracesSampleRate: undefined });

    const span = startInactiveSpan({ name: 'GET https://api.example.com/users/42' });
    span.recordException(new Error('getaddrinfo ENOTFOUND api.example.com'));

    await client.flush();

    expect(span.isRecording()).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values?.[0]?.value).toBe('getaddrinfo ENOTFOUND api.example.com');
  });

  it('does not capture an exception that was already captured', async () => {
    initClient();
    const error = new Error('Connection terminated unexpectedly');

    startSpan({ name: 'SELECT * FROM users WHERE id = $1' }, span => {
      captureException(error, { mechanism: { type: 'auto.middleware.express', handled: false } });
      span.recordException(error);
    });

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values?.[0]?.mechanism).toEqual({ type: 'auto.middleware.express', handled: false });
  });

  it('does not capture exceptions recorded while tracing is suppressed', async () => {
    initClient();

    suppressTracing(() => {
      startInactiveSpan({ name: 'POST https://o0.ingest.sentry.io/api/0/envelope/' }).recordException(
        new Error('socket hang up'),
      );
    });

    await client.flush();

    expect(events).toHaveLength(0);
  });

  it('does not capture exceptions recorded while a captured exception is processed', async () => {
    initClient({
      beforeSend: event => {
        events.push(event);
        startInactiveSpan({ name: 'GET https://api.example.com/users/42' }).recordException(
          new Error('connect ECONNREFUSED 127.0.0.1:443'),
        );
        return event;
      },
    });

    startInactiveSpan({ name: 'SELECT * FROM users WHERE id = $1' }).recordException(
      new Error('Connection terminated unexpectedly'),
    );

    await client.flush();

    expect(events).toHaveLength(1);
    expect(events[0]?.exception?.values?.[0]?.value).toBe('Connection terminated unexpectedly');
  });

  it('does not capture recorded exceptions when the integration is not added', async () => {
    initClient({ integrations: [] });

    startInactiveSpan({ name: 'SELECT * FROM users WHERE id = $1' }).recordException(
      new Error('Connection terminated unexpectedly'),
    );

    await client.flush();

    expect(events).toHaveLength(0);
  });
});
