import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';
import {
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
} from '../../../src';
import { DEFAULT_ENVIRONMENT } from '../../../src/constants';
import { getDynamicSamplingContextFromSpan, SentrySpan, startInactiveSpan } from '../../../src/tracing';
import { freezeDscOnSpan, getDynamicSamplingContextFromClient } from '../../../src/tracing/dynamicSamplingContext';
import type { Span, SpanContextData } from '../../../src/types-hoist/span';
import type { TransactionSource } from '../../../src/types-hoist/transaction';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('getDynamicSamplingContextFromSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0, release: '1.0.1' });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('uses frozen DSC from span', () => {
    const rootSpan = new SentrySpan({
      name: 'tx',
      sampled: true,
    });

    freezeDscOnSpan(rootSpan, { environment: 'myEnv' });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({ environment: 'myEnv' });
  });

  test('uses frozen DSC from traceState', () => {
    const rootSpan = {
      spanContext() {
        return {
          traceId: '1234',
          spanId: '12345',
          traceFlags: 0,
          traceState: {
            get(key: string) {
              if (key === 'sentry.dsc') {
                return 'sentry-environment=myEnv2';
              } else {
                return undefined;
              }
            },
          } as unknown as SpanContextData['traceState'],
        };
      },
    } as Span;

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({ environment: 'myEnv2' });
  });

  test('returns a new DSC, if no DSC was provided during rootSpan creation (via attributes)', () => {
    const rootSpan = startInactiveSpan({ name: 'tx' });

    // Setting the attribute should overwrite the computed values
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, 0.56);
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({
      public_key: undefined,
      org_id: undefined,
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '0.56',
      trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      transaction: 'tx',
      sample_rand: expect.any(String),
    });
  });

  test('returns a new DSC, if no DSC was provided during rootSpan creation (via deprecated metadata)', () => {
    const rootSpan = startInactiveSpan({
      name: 'tx',
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({
      public_key: undefined,
      org_id: undefined,
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '1',
      trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      transaction: 'tx',
      sample_rand: expect.any(String),
    });
  });

  test('returns a new DSC, if no DSC was provided during rootSpan creation (via new Txn and deprecated metadata)', () => {
    const rootSpan = new SentrySpan({
      name: 'tx',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 0.56,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      },
      sampled: true,
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({
      public_key: undefined,
      org_id: undefined,
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '0.56',
      trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      transaction: 'tx',
      sample_rand: undefined, // this is a bit funky admittedly
    });
  });

  describe('Including rootSpan name in DSC', () => {
    test('is not included if rootSpan source is url', () => {
      const rootSpan = new SentrySpan({
        name: 'tx',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 0.56,
        },
      });

      const dsc = getDynamicSamplingContextFromSpan(rootSpan);
      expect(dsc.transaction).toBeUndefined();
    });

    test.each([
      ['is included if rootSpan source is parameterized route/url', 'route'],
      ['is included if rootSpan source is a custom name', 'custom'],
    ] as const)('%s', (_: string, source: TransactionSource) => {
      const rootSpan = startInactiveSpan({
        name: 'tx',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
        },
      });

      rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);

      const dsc = getDynamicSamplingContextFromSpan(rootSpan);

      expect(dsc.transaction).toEqual('tx');
    });
  });

  it("doesn't return the sampled flag in the DSC if in Tracing without Performance mode", () => {
    const rootSpan = new SentrySpan({
      name: 'tx',
      sampled: undefined,
    });

    // Simulate TwP mode by deleting the tracesSampleRate option set in beforeEach
    delete getClient()?.getOptions().tracesSampleRate;

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({
      public_key: undefined,
      org_id: undefined,
      release: '1.0.1',
      environment: 'production',
      trace_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      transaction: 'tx',
    });
  });
});

describe('getDynamicSamplingContextFromClient', () => {
  const TRACE_ID = '4b25bc58f14243d8b208d1e22a054164';
  let client: TestClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates DSC with basic client information', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        release: '1.0.0',
        environment: 'test-env',
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(dsc).toEqual({
      trace_id: TRACE_ID,
      release: '1.0.0',
      environment: 'test-env',
      public_key: 'public',
      org_id: undefined,
    });
  });

  it('uses DEFAULT_ENVIRONMENT when environment is not specified', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        release: '1.0.0',
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(dsc.environment).toBe(DEFAULT_ENVIRONMENT);
  });

  it('uses orgId from options when specified', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        orgId: '00222111',
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(dsc.org_id).toBe('00222111');
  });

  it('infers orgId from DSN host when not explicitly provided', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@o123456.sentry.io/1',
      }),
    );

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(dsc.org_id).toBe('123456');
  });

  it('prioritizes explicit orgId over inferred from DSN', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        orgId: '1234560',
        dsn: 'https://public@my-org.sentry.io/1',
      }),
    );

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(dsc.org_id).toBe('1234560');
  });

  it('handles orgId passed as number', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@my-org.sentry.io/1',
        orgId: 123456,
      }),
    );

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(dsc.org_id).toBe('123456');
  });

  it('handles missing DSN gracefully', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        release: '1.0.0',
      }),
    );

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(dsc.public_key).toBeUndefined();
    expect(dsc.org_id).toBeUndefined();
  });

  it('emits createDsc event with the generated DSC', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        release: '1.0.0',
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const emitSpy = vi.spyOn(client, 'emit');

    const dsc = getDynamicSamplingContextFromClient(TRACE_ID, client);

    expect(emitSpy).toHaveBeenCalledWith('createDsc', dsc);
  });
});
