import { SENTRY_OP, SENTRY_ORIGIN, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import {
  getActiveSpan,
  getIsolationScope,
  getMainCarrier,
  getRootSpan,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import { orpcIntegration } from '../../src/integrations/orpc';
import { defaultShouldHandleError } from '../../src/integrations/orpc/error-capture';
import type { SentryORPCSpan } from '../../src/integrations/orpc/tracer';
import { SentryORPCTracer, setORPCTracer } from '../../src/integrations/orpc/tracer';
import type { ORPCTracingHeaders } from '../../src/integrations/orpc/types';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const SENTRY_TRACE = '12312012123120121231201212312012-1121201211212012-1';

describe('orpcIntegration', () => {
  let tracer: SentryORPCTracer;

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    setAsyncLocalStorageAsyncContextStrategy();
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    tracer = new SentryORPCTracer();
  });

  afterEach(() => {
    setORPCTracer(undefined);
    setAsyncContextStrategy(undefined);
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('installs the Sentry tracer as the global oRPC tracer', () => {
    orpcIntegration().setupOnce!();

    expect((globalThis as Record<symbol, unknown>)[Symbol.for('ORPC_TRACER')]).toBeInstanceOf(SentryORPCTracer);
  });

  it('leaves ending the span of `startActiveSpan` to the caller', async () => {
    const span = await tracer.startActiveSpan('call_procedure', undefined, async span => {
      expect(tracer.getActiveSpan()).toEqual(span);
      return (span as SentryORPCSpan).span;
    });

    expect(spanToJSON(span).end_timestamp).toBeUndefined();
    expect(spanToJSON(span).attributes).toMatchObject({ [SENTRY_ORIGIN]: 'auto.rpc.orpc' });

    span.end();
    expect(spanToJSON(span).end_timestamp).toBeDefined();
  });

  it('marks procedure call spans as `rpc` spans', () => {
    const span = tracer.startSpan('orpc.planet/find') as SentryORPCSpan;

    expect(spanToJSON(span.span).attributes).toMatchObject({ [SENTRY_OP]: 'rpc', [SENTRY_ORIGIN]: 'auto.rpc.orpc' });
  });

  it('starts spans as children of the given parent', () => {
    const parent = tracer.startSpan('parent') as SentryORPCSpan;
    const child = tracer.startSpan('child', parent) as SentryORPCSpan;

    expect(spanToJSON(child.span).parent_span_id).toBe(parent.span.spanContext().spanId);
  });

  it('names the transaction after the procedure once a request is routed', async () => {
    await startSpan({ name: 'POST /rpc/planet/find', op: 'http.server' }, async rootSpan => {
      await tracer.startActiveSpan('POST /rpc/planet/find', undefined, async span => {
        span.updateName('orpc.planet/find');
        span.end();
      });

      expect(spanToJSON(rootSpan).name).toBe('orpc.planet/find');
      expect(spanToJSON(rootSpan).attributes).toMatchObject({ [SENTRY_SEGMENT_NAME_SOURCE]: 'route' });
      expect(getIsolationScope().getScopeData().transactionName).toBe('orpc.planet/find');
    });
  });

  it('does not rename the transaction for an unmatched request', async () => {
    await startSpan({ name: 'POST /unknown', op: 'http.server' }, async rootSpan => {
      await tracer.startActiveSpan('POST /unknown', undefined, async span => {
        span.updateName('orpc_no_match');
        span.end();
      });

      expect(spanToJSON(rootSpan).name).toBe('POST /unknown');
    });
  });

  it('marks the span as failed only for error-level exceptions', () => {
    const info = tracer.startSpan('info') as SentryORPCSpan;
    info.recordException('info', { message: 'aborted' });
    const error = tracer.startSpan('error') as SentryORPCSpan;
    error.recordException('error', { message: 'boom' });

    expect(spanToJSON(info.span).status).not.toBe('error');
    expect(spanToJSON(error.span).status).toBe('error');
  });

  describe('extract', () => {
    it('does not continue the incoming trace when a span is already active', () => {
      startSpan({ name: 'http.server' }, () => {
        expect(tracer.extract({ 'sentry-trace': SENTRY_TRACE })).toBeUndefined();
      });
    });

    it('returns nothing without a `sentry-trace` header', () => {
      expect(tracer.extract({})).toBeUndefined();
    });

    it('continues the incoming trace for the request span', async () => {
      const parent = tracer.extract({ 'sentry-trace': SENTRY_TRACE, baggage: ['sentry-environment=prod'] });

      const span = await tracer.startActiveSpan('POST /rpc/planet/find', parent, async span => {
        expect(getRootSpan(getActiveSpan()!)).toBe((span as SentryORPCSpan).span);
        return (span as SentryORPCSpan).span;
      });

      expect(span.spanContext().traceId).toBe('12312012123120121231201212312012');
      expect(spanToJSON(span).parent_span_id).toBe('1121201211212012');
    });
  });

  describe('inject', () => {
    it('is not set by default', () => {
      expect(tracer.inject).toBeUndefined();
    });

    it('writes the trace headers of the span without overwriting existing headers', () => {
      const injectingTracer = new SentryORPCTracer({ injectTraceHeaders: true });
      const span = injectingTracer.startSpan('orpc.planet/find') as SentryORPCSpan;
      const headers: ORPCTracingHeaders = { baggage: 'custom=value' };

      injectingTracer.inject!(span, headers);

      expect(headers['sentry-trace']).toBe(`${span.span.spanContext().traceId}-${span.span.spanContext().spanId}-1`);
      expect(headers.baggage).toBe('custom=value');
    });
  });
});

function orpcError(code: string): Error {
  return Object.assign(new Error(code), { name: 'ORPCError', code });
}

describe('defaultShouldHandleError', () => {
  it.each([
    ['an error without a status', new Error('boom'), true],
    ['a non-object', 'boom', true],
    ['an error with a status', Object.assign(new Error('Not found'), { status: 404 }), true],
    ['an INTERNAL_SERVER_ERROR ORPCError', orpcError('INTERNAL_SERVER_ERROR'), true],
    ['a NOT_FOUND ORPCError', orpcError('NOT_FOUND'), false],
    ['an ORPCError with a custom code', orpcError('RATE_LIMITED'), false],
    ['an abort error', Object.assign(new Error('aborted'), { name: 'AbortError' }), false],
  ])('returns the right result for %s', (_, error, expected) => {
    expect(defaultShouldHandleError(error)).toBe(expected);
  });
});
