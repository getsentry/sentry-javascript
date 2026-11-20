import { createTransport, setCurrentClient, startSpan } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import type { TraceProvider } from '@solidjs/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { solidServerTracePropagationIntegration } from '../../../src/solid2/server';

const { provide } = vi.hoisted(() => ({ provide: vi.fn<(provider: TraceProvider) => () => void>() }));

// The production build has no `OBSERVE`; observe and dev builds do.
vi.mock('solid-js', async importOriginal => ({
  ...(await importOriginal<object>()),
  OBSERVE: { server: { trace: { provide } } },
}));

describe('solidServerTracePropagationIntegration', () => {
  beforeEach(() => {
    provide.mockClear();
    const client = new NodeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      integrations: [],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
      stackParser: () => [],
    });
    setCurrentClient(client);
    client.init();
  });

  it("hands the active span's trace to Solid's runtime", () => {
    solidServerTracePropagationIntegration().setup!({} as NodeClient);
    const provider = provide.mock.calls[0]![0];

    const { result, traceId, spanId } = startSpan({ name: 'GET /user/:id' }, span => ({
      result: provider(undefined),
      ...span.spanContext(),
    }));

    expect(result).toEqual({
      traceId,
      spanId,
      sampled: true,
      entries: {
        'sentry-trace': `${traceId}-${spanId}-1`,
        baggage: expect.stringContaining(`sentry-trace_id=${traceId}`),
      },
    });
  });

  it('leaves the trace to the runtime outside a span', () => {
    solidServerTracePropagationIntegration().setup!({} as NodeClient);
    const provider = provide.mock.calls[0]![0];

    expect(provider(undefined)).toBeUndefined();
  });
});
