import type { Envelope, Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

type SpanV2Payload = {
  items?: Array<{
    name?: string;
    trace_id?: string;
    is_segment?: boolean;
    attributes?: Record<string, { value?: unknown }>;
  }>;
};

// The startup span and error are captured while the worker entry is evaluated, where workerd blocks
// timers and I/O. They only arrive if the Vite plugin initialized the SDK before the entry ran and
// both are kept queued until the first request sends them.
it('delivers a span and a handled error from global scope on the first request', async ({ signal }) => {
  let startupTraceId: string | undefined;
  let errorTraceId: string | undefined;
  let requestTraceId: string | undefined;

  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as SpanV2Payload;
      const startupSpan = payload.items?.find(span => span.name === 'startup.load-config');
      expect(startupSpan).toBeDefined();
      expect(startupSpan?.is_segment).toBe(true);
      expect(startupSpan?.attributes?.['sentry.op']?.value).toBe('function');
      startupTraceId = startupSpan?.trace_id;
    })
    .expect((envelope: Envelope) => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.level).toBe('error');
      expect(event.exception?.values?.[0]).toEqual(
        expect.objectContaining({
          type: 'SyntaxError',
          value: expect.stringContaining('JSON'),
          stacktrace: { frames: expect.any(Array) },
          mechanism: { type: 'generic', handled: true },
        }),
      );
      expect(event.request).toBeUndefined();
      errorTraceId = event.contexts?.trace?.trace_id;
    })
    .expect((envelope: Envelope) => {
      const payload = envelope[1]?.[0]?.[1] as SpanV2Payload;
      const requestSpan = payload.items?.find(span => span.attributes?.['sentry.op']?.value === 'http.server');
      expect(requestSpan).toBeDefined();
      requestTraceId = requestSpan?.trace_id;
    })
    .unordered()
    .start(signal);

  const body = await runner.makeRequest('get', '/');
  expect(body).toEqual({ greeting: 'hello' });
  await runner.completed();

  expect(startupTraceId).toBeDefined();
  expect(errorTraceId).toBe(startupTraceId);
  expect(startupTraceId).not.toBe(requestTraceId);
});
