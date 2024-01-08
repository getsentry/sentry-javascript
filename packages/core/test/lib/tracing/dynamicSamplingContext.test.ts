import type { TransactionSource } from '@sentry/types';
import { Hub, makeMain } from '../../../src';
import { Transaction, getDynamicSamplingContextFromSpan } from '../../../src/tracing';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

describe('getDynamicSamplingContextFromSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0, release: '1.0.1' });
    const client = new TestClient(options);
    const hub = new Hub(client);
    makeMain(hub);
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
    const transaction = new Transaction({
      name: 'tx',
      metadata: {
        sampleRate: 0.56,
      },
    });

    const dynamicSamplingContext = getDynamicSamplingContextFromSpan(transaction);

    expect(dynamicSamplingContext).toStrictEqual({
      release: '1.0.1',
      environment: 'production',
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

      const dsc = getDynamicSamplingContextFromSpan(transaction);

      expect(dsc.transaction).toEqual('tx');
    });
  });
});
