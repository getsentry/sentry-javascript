import { expect, it } from 'vitest';
import type { Event, SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

// Every route here is a raw URL, so the streamed segment name keeps the method only and the route
// is identified through `url.path`.

it('propagates trace from Worker (ExportedHandler) to WorkerEntrypoint via service binding fetch', async ({
  signal,
}) => {
  let workerSpan: SerializedStreamedSpan | undefined;
  let entrypointSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // Main worker HTTP server segment span
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/call-entrypoint' });
      workerSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // WorkerEntrypoint HTTP server segment span (from service binding fetch)
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/answer' });
      entrypointSpan = segmentSpan;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-entrypoint');
  expect(response).toBe('The answer is 42');

  await runner.completed();

  // Both segment spans should share the same trace_id
  expect(workerSpan?.trace_id).toBeDefined();
  expect(entrypointSpan?.trace_id).toBe(workerSpan?.trace_id);

  // Verify the parent-child relationship: Worker -> WorkerEntrypoint
  expect(entrypointSpan?.parent_span_id).toBe(workerSpan?.span_id);
});

it('propagates trace for request with query params from Worker to WorkerEntrypoint', async ({ signal }) => {
  let workerSpan: SerializedStreamedSpan | undefined;
  let entrypointSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/call-entrypoint-greet' });
      workerSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/greet' });
      entrypointSpan = segmentSpan;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-entrypoint-greet');
  expect(response).toBe('Hello, World!');

  await runner.completed();

  expect(workerSpan?.trace_id).toBeDefined();
  expect(entrypointSpan?.trace_id).toBe(workerSpan?.trace_id);
  expect(entrypointSpan?.parent_span_id).toBe(workerSpan?.span_id);
});

it('instruments inherited custom WorkerEntrypoint RPC methods and strips metadata', async ({ signal }) => {
  let callerSpan: SerializedStreamedSpan | undefined;
  let receiverGetSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/call-entrypoint-rpc' });
      callerSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('get');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.worker_entrypoint',
      });
      receiverGetSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('inherited');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.worker_entrypoint',
      });
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<{ argumentCount: number; inherited: string; key: string }>(
    'get',
    '/call-entrypoint-rpc',
  );
  expect(response).toEqual({ argumentCount: 1, inherited: 'base-value', key: 'feature-key' });

  await runner.completed();

  expect(receiverGetSpan?.trace_id).toBeDefined();
  expect(receiverGetSpan?.trace_id).toBe(callerSpan?.trace_id);
  expect(receiverGetSpan?.parent_span_id).toBe(callerSpan?.span_id);
});

it('captures errors thrown by custom WorkerEntrypoint RPC methods', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.value).toBe('custom RPC receiver failed');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.faas.cloudflare.worker_entrypoint',
      });
      expect(event.tags?.initial_scope).toBe('applied');
      expect(event.tags?.before_send).toBe('applied');
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(segmentSpan?.name).toBe('throwError');
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(segmentSpan?.attributes['url.path']).toEqual({
        type: 'string',
        value: '/call-entrypoint-rpc-error',
      });
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-entrypoint-rpc-error');
  expect(response).toBe('fallback');

  await runner.completed();
});

// Regression test for https://github.com/getsentry/sentry-javascript/issues/23233: a receiver that
// is not instrumented never strips Sentry's trailing metadata argument, so a caller must only
// propagate to bindings it was explicitly told about.
it('does not change RPC method arguments for a binding left off the allowlist', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/call-uninstrumented-rpc' });
    })
    .start(signal);

  const response = await runner.makeRequest<{ argumentCount: number; key: string }>('get', '/call-uninstrumented-rpc');
  expect(response).toEqual({ argumentCount: 1, key: 'uninstrumented-key' });

  await runner.completed();
});

it('does not inject RPC trace metadata into receiver calls when rpcTracePropagationBindings is empty', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({
        type: 'string',
        value: '/call-entrypoint-rpc-no-propagation',
      });
    })
    .start(signal);

  const response = await runner.makeRequest<{ argumentCount: number; key: string }>(
    'get',
    '/call-entrypoint-rpc-no-propagation',
  );
  expect(response).toEqual({ argumentCount: 1, key: 'no-prop-key' });

  await runner.completed();
});

it('captures errors from loopback WorkerEntrypoint RPC without trace propagation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.value).toBe('loopback RPC receiver failed');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        handled: false,
        type: 'auto.faas.cloudflare.worker_entrypoint',
      });
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/call-loopback-rpc-error' });
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/call-loopback-rpc-error');
  expect(response).toBe('fallback');

  await runner.completed();
});
