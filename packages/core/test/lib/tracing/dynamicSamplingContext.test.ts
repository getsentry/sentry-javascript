import type { TransactionSource } from '@sentry/types';
import { Hub, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, makeMain } from '../../../src';
import { Transaction, getDynamicSamplingContextFromSpan, startInactiveSpan } from '../../../src/tracing';
import { addTracingExtensions } from '../../../src/tracing';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

describe('getDynamicSamplingContextFromSpan', () => {
  let hub: Hub;
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0, release: '1.0.1' });
    const client = new TestClient(options);
    hub = new Hub(client);
    hub.bindClient(client);
    makeMain(hub);
    addTracingExtensions();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns the DSC provided during transaction creation', () => {
    const transaction = new Transaction({
      name: 'tx',
      metadata: { dynamicSamplingContext: { environment: 'myEnv' } },
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(transaction);

    expect(dynamicSamplingContext).toStrictEqual({ environment: 'myEnv' });
  });

  test('returns a new DSC, if no DSC was provided during transaction creation', () => {
    const transaction = startInactiveSpan({ name: 'tx' });

    // Only setting the attribute manually because we can't "fake" a
    // sample rate or txn name source anymore like we used to.
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

  describe('Including transaction name in DSC', () => {
    test('is not included if transaction source is url', () => {
      const transaction = new Transaction({
        name: 'tx',
        metadata: {
          source: 'url',
        },
      });

      const dsc = getDynamicSamplingContextFromSpan(transaction);
      expect(dsc.transaction).toBeUndefined();
    });

    test.each([
      ['is included if transaction source is parameterized route/url', 'route'],
      ['is included if transaction source is a custom name', 'custom'],
    ])('%s', (_: string, source) => {
      const transaction = new Transaction({
        name: 'tx',
        metadata: {
          ...(source && { source: source as TransactionSource }),
        },
      });

      // Only setting the attribute manually because we're directly calling new Transaction()
      transaction?.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);

      const dsc = getDynamicSamplingContextFromSpan(transaction);

      expect(dsc.transaction).toEqual('tx');
    });
  });
});
