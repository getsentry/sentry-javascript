import type { Context, ContextManager } from '@opentelemetry/api';
import { context, INVALID_SPAN_CONTEXT, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Envelope } from '@sentry/core';
import { getCurrentScope, getMainCarrier, registerExternalPropagationContext, setCurrentClient } from '@sentry/core';
import { getOtlpTracesEndpoint, otlpIntegration } from '../src/otlp';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

const DSN = 'https://public@dsn.ingest.sentry.io/1337';

const OTEL_TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTEL_SPAN_ID = 'bbbbbbbbbbbbbbbb';

/**
 * Synchronous context manager, so that `trace.getActiveSpan()` resolves inside `context.with()`.
 * The OpenTelemetry API ships only a no-op manager; a real runtime installs one via its SDK.
 */
class SyncContextManager implements ContextManager {
  private _activeContext: Context = ROOT_CONTEXT;

  public active(): Context {
    return this._activeContext;
  }

  public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    activeContext: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previousContext = this._activeContext;
    this._activeContext = activeContext;
    try {
      return fn.call(thisArg, ...args);
    } finally {
      this._activeContext = previousContext;
    }
  }

  public bind<T>(_activeContext: Context, target: T): T {
    return target;
  }

  public enable(): this {
    return this;
  }

  public disable(): this {
    this._activeContext = ROOT_CONTEXT;
    return this;
  }
}

function withActiveOtelSpan<T>(callback: () => T): T {
  const otelSpan = trace.wrapSpanContext({
    traceId: OTEL_TRACE_ID,
    spanId: OTEL_SPAN_ID,
    traceFlags: TraceFlags.SAMPLED,
  });

  return context.with(trace.setSpan(context.active(), otelSpan), callback);
}

function setupClientWithOtlpIntegration(): TestClient {
  const client = new TestClient(
    getDefaultTestClientOptions({ dsn: DSN, integrations: [otlpIntegration()], stackParser: () => [] }),
  );
  setCurrentClient(client);
  client.init();
  return client;
}

/** Captures the envelopes the client actually sends, so their headers can be asserted on. */
function setupClientCapturingEnvelopes(): { client: TestClient; envelopes: Envelope[] } {
  const envelopes: Envelope[] = [];
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: DSN,
      integrations: [otlpIntegration()],
      stackParser: () => [],
      enableSend: true,
    }),
  );
  client.on('beforeEnvelope', envelope => envelopes.push(envelope));
  setCurrentClient(client);
  client.init();
  return { client, envelopes };
}

describe('otlpIntegration', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    context.setGlobalContextManager(new SyncContextManager());
  });

  afterEach(() => {
    registerExternalPropagationContext(() => undefined);
    context.disable();
  });

  it('links captured errors to the active OpenTelemetry span', async () => {
    const client = setupClientWithOtlpIntegration();

    withActiveOtelSpan(() => {
      client.captureException(new Error('boom'));
    });
    await client.flush();

    expect(client.event?.contexts?.trace).toEqual({
      trace_id: OTEL_TRACE_ID,
      span_id: OTEL_SPAN_ID,
    });
  });

  it('sends no envelope trace header while riding along on an OpenTelemetry span', async () => {
    const { client, envelopes } = setupClientCapturingEnvelopes();
    getCurrentScope().setPropagationContext({ traceId: 'cccccccccccccccccccccccccccccccc', sampleRand: 0.5 });

    withActiveOtelSpan(() => {
      client.captureException(new Error('boom'));
    });
    await client.flush();

    // The scope's DSC would name a different trace than the event, and we have no transaction
    // semantics to describe the OpenTelemetry one with, so no sampling context is sent at all.
    const [envelopeHeaders] = envelopes[0] ?? [];
    expect(envelopeHeaders).toBeDefined();
    expect(envelopeHeaders?.trace).toBeUndefined();
  });

  it('still sends an envelope trace header when no OpenTelemetry span is active', async () => {
    const { client, envelopes } = setupClientCapturingEnvelopes();
    getCurrentScope().setPropagationContext({ traceId: 'cccccccccccccccccccccccccccccccc', sampleRand: 0.5 });

    client.captureException(new Error('boom'));
    await client.flush();

    const [envelopeHeaders] = envelopes[0] ?? [];
    expect(envelopeHeaders?.trace).toMatchObject({ trace_id: 'cccccccccccccccccccccccccccccccc' });
  });

  it('ignores an active span with an invalid span context', async () => {
    const client = setupClientWithOtlpIntegration();
    getCurrentScope().setPropagationContext({ traceId: 'cccccccccccccccccccccccccccccccc', sampleRand: 0.5 });

    // OpenTelemetry hands out a span wrapping `INVALID_SPAN_CONTEXT` when tracing is suppressed, or
    // when a span is started before a tracer provider is registered.
    context.with(trace.setSpan(context.active(), trace.wrapSpanContext(INVALID_SPAN_CONTEXT)), () => {
      client.captureException(new Error('boom'));
    });
    await client.flush();

    expect(client.event?.contexts?.trace?.trace_id).toBe('cccccccccccccccccccccccccccccccc');
  });

  it('falls back to the Sentry propagation context when no OpenTelemetry span is active', async () => {
    const client = setupClientWithOtlpIntegration();
    getCurrentScope().setPropagationContext({ traceId: 'cccccccccccccccccccccccccccccccc', sampleRand: 0.5 });

    client.captureException(new Error('boom'));
    await client.flush();

    expect(client.event?.contexts?.trace?.trace_id).toBe('cccccccccccccccccccccccccccccccc');
  });
});

describe('getOtlpTracesEndpoint', () => {
  it('builds the traces URL and auth header from a DSN', () => {
    expect(getOtlpTracesEndpoint(DSN)).toEqual({
      url: 'https://dsn.ingest.sentry.io/api/1337/integration/otlp/v1/traces/',
      headers: { 'X-Sentry-Auth': 'Sentry sentry_version=7, sentry_key=public' },
    });
  });

  it('preserves port and path from a self-hosted DSN', () => {
    expect(getOtlpTracesEndpoint('http://public@localhost:9000/sentry/42')?.url).toBe(
      'http://localhost:9000/sentry/api/42/integration/otlp/v1/traces/',
    );
  });

  it('returns undefined for an unparseable DSN', () => {
    expect(getOtlpTracesEndpoint('not-a-dsn')).toBeUndefined();
  });
});
