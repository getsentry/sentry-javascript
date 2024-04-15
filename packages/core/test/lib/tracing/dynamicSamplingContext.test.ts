import type { TransactionSource } from '@sentry/types';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
} from '../../../src';
import { SentrySpan, getDynamicSamplingContextFromSpan, startInactiveSpan } from '../../../src/tracing';
import { freezeDscOnSpan } from '../../../src/tracing/dynamicSamplingContext';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

describe('getDynamicSamplingContextFromSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0, release: '1.0.1' });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.resetAllMocks();
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

  test('returns a new DSC, if no DSC was provided during rootSpan creation (via attributes)', () => {
    const rootSpan = startInactiveSpan({ name: 'tx' });

    // Setting the attribute should overwrite the computed values
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, 0.56);
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '0.56',
      trace_id: expect.any(String),
      transaction: 'tx',
    });
  });

  test('returns a new DSC, if no DSC was provided during rootSpan creation (via deprecated metadata)', () => {
    const rootSpan = startInactiveSpan({
      name: 'tx',
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(rootSpan);

    expect(dynamicSamplingContext).toStrictEqual({
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '1',
      trace_id: expect.any(String),
      transaction: 'tx',
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
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '0.56',
      trace_id: expect.any(String),
      transaction: 'tx',
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
});
