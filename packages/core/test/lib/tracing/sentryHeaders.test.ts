import type { Client } from '@sentry/types';
import { Scope, SentrySpan, getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient } from '../../../src';
import { freezeDscOnSpan } from '../../../src/tracing/dynamicSamplingContext';
import { getSentryHeaders } from '../../../src/tracing/sentryHeaders';
import type { TestClientOptions } from '../../mocks/client';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

const dsn = 'https://123@sentry.io/42';

const SCOPE_TRACE_ID = '12345678901234567890123456789012';
const SCOPE_SPAN_ID = '1234567890123456';

function setupClient(opts?: TestClientOptions): Client {
  getCurrentScope().clear();
  getIsolationScope().clear();
  getGlobalScope().clear();

  getCurrentScope().setPropagationContext({
    traceId: SCOPE_TRACE_ID,
    spanId: SCOPE_SPAN_ID,
  });

  const options = getDefaultTestClientOptions({
    dsn,
    ...opts,
  });
  const client = new TestClient(options);
  setCurrentClient(client);
  client.init();

  return client;
}

describe('getSentryHeaders', () => {
  beforeEach(() => {});

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('works with a minimal client', () => {
    const client = setupClient();

    const { sentryTrace, baggage } = getSentryHeaders({ client });

    expect(sentryTrace).toEqual(`${SCOPE_TRACE_ID}-${SCOPE_SPAN_ID}`);
    expect(baggage).toEqual(`sentry-environment=production,sentry-public_key=123,sentry-trace_id=${SCOPE_TRACE_ID}`);
  });

  it('allows to pass a specific scope', () => {
    const client = setupClient();

    const traceId = '12345678901234567890123456789099';
    const spanId = '1234567890123499';
    const scope = new Scope();
    scope.setPropagationContext({
      traceId,
      spanId,
    });

    const { sentryTrace, baggage } = getSentryHeaders({ client, scope });

    expect(sentryTrace).toEqual(`${traceId}-${spanId}`);
    expect(baggage).toEqual(`sentry-environment=production,sentry-public_key=123,sentry-trace_id=${traceId}`);
  });

  it('uses DSC from scope, if available', () => {
    const client = setupClient();

    const traceId = '12345678901234567890123456789099';
    const spanId = '1234567890123499';
    const scope = new Scope();
    scope.setPropagationContext({
      traceId,
      spanId,
      dsc: {
        environment: 'test-dev',
        public_key: '456',
        trace_id: '12345678901234567890123456789088',
      },
    });

    const { sentryTrace, baggage } = getSentryHeaders({ client, scope });

    expect(sentryTrace).toEqual(`${traceId}-${spanId}`);
    expect(baggage).toEqual(
      'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088',
    );
  });

  it('works with a minimal unsampled span', () => {
    const client = setupClient();

    const traceId = '12345678901234567890123456789099';
    const spanId = '1234567890123499';

    const span = new SentrySpan({
      traceId,
      spanId,
      sampled: false,
    });

    const { sentryTrace, baggage } = getSentryHeaders({ client, span });

    expect(sentryTrace).toEqual(`${traceId}-${spanId}-0`);
    expect(baggage).toEqual(`sentry-environment=production,sentry-public_key=123,sentry-trace_id=${traceId}`);
  });

  it('works with a minimal sampled span', () => {
    const client = setupClient();

    const traceId = '12345678901234567890123456789099';
    const spanId = '1234567890123499';

    const span = new SentrySpan({
      traceId,
      spanId,
      sampled: true,
    });

    const { sentryTrace, baggage } = getSentryHeaders({ client, span });

    expect(sentryTrace).toEqual(`${traceId}-${spanId}-1`);
    expect(baggage).toEqual(`sentry-environment=production,sentry-public_key=123,sentry-trace_id=${traceId}`);
  });

  it('works with a SentrySpan with frozen DSC', () => {
    const client = setupClient();

    const traceId = '12345678901234567890123456789099';
    const spanId = '1234567890123499';

    const span = new SentrySpan({
      traceId,
      spanId,
      sampled: true,
    });

    freezeDscOnSpan(span, {
      environment: 'test-dev',
      public_key: '456',
      trace_id: '12345678901234567890123456789088',
    });

    const { sentryTrace, baggage } = getSentryHeaders({ client, span });

    expect(sentryTrace).toEqual(`${traceId}-${spanId}-1`);
    expect(baggage).toEqual(
      'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088',
    );
  });

  it('works with an OTEL span with frozen DSC in traceState', () => {
    const client = setupClient();

    const traceId = '12345678901234567890123456789099';
    const spanId = '1234567890123499';

    const span = new SentrySpan({
      traceId,
      spanId,
      sampled: true,
    });

    span.spanContext = () => {
      const traceState = {
        set: () => traceState,
        unset: () => traceState,
        get: (key: string) => {
          if (key === 'sentry.dsc') {
            return 'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088';
          }
          return undefined;
        },
        serialize: () => '',
      };

      return {
        traceId,
        spanId,
        sampled: true,
        traceFlags: 1,
        traceState,
      };
    };

    const { sentryTrace, baggage } = getSentryHeaders({ client, span });

    expect(sentryTrace).toEqual(`${traceId}-${spanId}-1`);
    expect(baggage).toEqual(
      'sentry-environment=test-dev,sentry-public_key=456,sentry-trace_id=12345678901234567890123456789088',
    );
  });
});
