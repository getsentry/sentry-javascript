import type { TransactionSource } from '@sentry/types';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
} from '../../../src';
import {
  Transaction,
  addTracingExtensions,
  getDynamicSamplingContextFromSpan,
  startInactiveSpan,
} from '../../../src/tracing';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

describe('getDynamicSamplingContextFromSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0, release: '1.0.1' });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
    addTracingExtensions();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns the DSC provided during transaction creation', () => {
    // eslint-disable-next-line deprecation/deprecation -- using old API on purpose
    const transaction = new Transaction({
      name: 'tx',
      metadata: { dynamicSamplingContext: { environment: 'myEnv' } },
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(transaction);

    expect(dynamicSamplingContext).toStrictEqual({ environment: 'myEnv' });
  });

  test('returns a new DSC, if no DSC was provided during transaction creation (via attributes)', () => {
    const transaction = startInactiveSpan({ name: 'tx' });

    // Setting the attribute should overwrite the computed values
    transaction?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, 0.56);
    transaction?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(transaction!);

    expect(dynamicSamplingContext).toStrictEqual({
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '0.56',
      trace_id: expect.any(String),
      transaction: 'tx',
    });
  });

  test('returns a new DSC, if no DSC was provided during transaction creation (via deprecated metadata)', () => {
    const transaction = startInactiveSpan({
      name: 'tx',
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(transaction!);

    expect(dynamicSamplingContext).toStrictEqual({
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '1',
      trace_id: expect.any(String),
      transaction: 'tx',
    });
  });

  test('returns a new DSC, if no DSC was provided during transaction creation (via new Txn and deprecated metadata)', () => {
    // eslint-disable-next-line deprecation/deprecation -- using old API on purpose
    const transaction = new Transaction({
      name: 'tx',
      metadata: {
        sampleRate: 0.56,
      },
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
      },
      sampled: true,
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(transaction!);

    expect(dynamicSamplingContext).toStrictEqual({
      release: '1.0.1',
      environment: 'production',
      sampled: 'true',
      sample_rate: '0.56',
      trace_id: expect.any(String),
      transaction: 'tx',
    });
  });

  describe('Including transaction name in DSC', () => {
    test('is not included if transaction source is url', () => {
      // eslint-disable-next-line deprecation/deprecation -- using old API on purpose
      const transaction = new Transaction({
        name: 'tx',
        metadata: {
          sampleRate: 0.56,
        },
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      });

      const dsc = getDynamicSamplingContextFromSpan(transaction);
      expect(dsc.transaction).toBeUndefined();
    });

    test.each([
      ['is included if transaction source is parameterized route/url', 'route'],
      ['is included if transaction source is a custom name', 'custom'],
    ] as const)('%s', (_: string, source: TransactionSource) => {
      const transaction = startInactiveSpan({
        name: 'tx',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
        },
      });

      // Only setting the attribute manually because we're directly calling new Transaction()
      transaction?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);

      const dsc = getDynamicSamplingContextFromSpan(transaction!);

      expect(dsc.transaction).toEqual('tx');
    });
  });
});
