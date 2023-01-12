import { Transaction } from '../../../src';
import type { ResourceEntry } from '../../../src/browser/metrics';
import { _addMeasureSpans, _addResourceSpans } from '../../../src/browser/metrics';

describe('_addMeasureSpans', () => {
  const transaction = new Transaction({ op: 'pageload', name: '/' });
  beforeEach(() => {
    transaction.startChild = jest.fn();
  });

  it('adds measure spans to a transaction', () => {
    const entry: Omit<PerformanceMeasure, 'toJSON'> = {
      entryType: 'measure',
      name: 'measure-1',
      duration: 10,
      startTime: 12,
    };

    const timeOrigin = 100;
    const startTime = 23;
    const duration = 356;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenCalledTimes(0);
    _addMeasureSpans(transaction, entry, startTime, duration, timeOrigin);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenLastCalledWith({
      description: 'measure-1',
      startTimestamp: timeOrigin + startTime,
      endTimestamp: timeOrigin + startTime + duration,
      op: 'measure',
    });
  });
});

describe('_addResourceSpans', () => {
  const transaction = new Transaction({ op: 'pageload', name: '/' });
  beforeEach(() => {
    transaction.startChild = jest.fn();
  });

  // We already track xhr, we don't need to use
  it('does not create spans for xmlhttprequest', () => {
    const entry: ResourceEntry = {
      initiatorType: 'xmlhttprequest',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
    };
    _addResourceSpans(transaction, entry, '/assets/to/me', 123, 456, 100);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenCalledTimes(0);
  });

  it('does not create spans for fetch', () => {
    const entry: ResourceEntry = {
      initiatorType: 'fetch',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
    };
    _addResourceSpans(transaction, entry, '/assets/to/me', 123, 456, 100);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenCalledTimes(0);
  });

  it('creates spans for resource spans', () => {
    const entry: ResourceEntry = {
      initiatorType: 'css',
      transferSize: 256,
      encodedBodySize: 456,
      decodedBodySize: 593,
    };

    const timeOrigin = 100;
    const startTime = 23;
    const duration = 356;

    _addResourceSpans(transaction, entry, '/assets/to/css', startTime, duration, timeOrigin);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenLastCalledWith({
      data: {
        ['Decoded Body Size']: entry.decodedBodySize,
        ['Encoded Body Size']: entry.encodedBodySize,
        ['Transfer Size']: entry.transferSize,
      },
      description: '/assets/to/css',
      endTimestamp: timeOrigin + startTime + duration,
      op: 'resource.css',
      startTimestamp: timeOrigin + startTime,
    });
  });

  it('creates a variety of resource spans', () => {
    const table = [
      {
        initiatorType: undefined,
        op: 'resource.other',
      },
      {
        initiatorType: '',
        op: 'resource.other',
      },
      {
        initiatorType: 'css',
        op: 'resource.css',
      },
      {
        initiatorType: 'image',
        op: 'resource.image',
      },
      {
        initiatorType: 'script',
        op: 'resource.script',
      },
    ];

    for (const { initiatorType, op } of table) {
      const entry: ResourceEntry = {
        initiatorType,
      };
      _addResourceSpans(transaction, entry, '/assets/to/me', 123, 234, 465);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(transaction.startChild).toHaveBeenLastCalledWith(
        expect.objectContaining({
          op,
        }),
      );
    }
  });

  it('allows for enter size of 0', () => {
    const entry: ResourceEntry = {
      initiatorType: 'css',
      transferSize: 0,
      encodedBodySize: 0,
      decodedBodySize: 0,
    };

    _addResourceSpans(transaction, entry, '/assets/to/css', 100, 23, 345);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transaction.startChild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          ['Decoded Body Size']: entry.decodedBodySize,
          ['Encoded Body Size']: entry.encodedBodySize,
          ['Transfer Size']: entry.transferSize,
        },
      }),
    );
  });
});
