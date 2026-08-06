import type { Context, ContextManager } from '@opentelemetry/api';
import { context, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  registerExternalPropagationContext,
  setCurrentClient,
} from '@sentry/core';
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

describe('otlpIntegration', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
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
