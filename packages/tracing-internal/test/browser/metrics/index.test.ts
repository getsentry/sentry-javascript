import { Transaction } from '../../../src';
import type { ResourceEntry } from '../../../src/browser/metrics';
import { _addMeasureSpans, _addResourceSpans } from '../../../src/browser/metrics';
import { WINDOW } from '../../../src/browser/types';

const mockWindowLocation = {
  ancestorOrigins: {},
  href: 'https://example.com/path/to/something',
  origin: 'https://example.com',
  protocol: 'https',
  host: 'example.com',
  hostname: 'example.com',
  port: '',
  pathname: '/path/to/something',
  search: '',
  hash: '',
} as Window['location'];

// @ts-expect-error store a reference so we can reset it later
const globalLocation = global.location;

const resourceEntryName = 'https://example.com/assets/to/css';

describe('_addMeasureSpans', () => {
  // eslint-disable-next-line deprecation/deprecation
  const transaction = new Transaction({ op: 'pageload', name: '/' });

  beforeEach(() => {
    // eslint-disable-next-line deprecation/deprecation
    transaction.startChild = jest.fn();
  });

  it('adds measure spans to a transaction', () => {
    const entry: Omit<PerformanceMeasure, 'toJSON'> = {
      entryType: 'measure',
      name: 'measure-1',
      duration: 10,
      startTime: 12,
      detail: undefined,
    };

    const timeOrigin = 100;
    const startTime = 23;
    const duration = 356;

    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(0);
    _addMeasureSpans(transaction, entry, startTime, duration, timeOrigin);
    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenLastCalledWith({
      description: 'measure-1',
      startTimestamp: timeOrigin + startTime,
      endTimestamp: timeOrigin + startTime + duration,
      op: 'measure',
      origin: 'auto.resource.browser.metrics',
    });
  });
});

describe('_addResourceSpans', () => {
  // eslint-disable-next-line deprecation/deprecation
  const transaction = new Transaction({ op: 'pageload', name: '/' });

  beforeAll(() => {
    setGlobalLocation(mockWindowLocation);
  });

  afterAll(() => {
    resetGlobalLocation();
  });

  beforeEach(() => {
    // eslint-disable-next-line deprecation/deprecation
    transaction.startChild = jest.fn();
  });

  // We already track xhr, we don't need to use
  it('does not create spans for xmlhttprequest', () => {
    const entry: ResourceEntry = {
      initiatorType: 'xmlhttprequest',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
      renderBlockingStatus: 'non-blocking',
    };
    _addResourceSpans(transaction, entry, resourceEntryName, 123, 456, 100);

    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(0);
  });

  it('does not create spans for fetch', () => {
    const entry: ResourceEntry = {
      initiatorType: 'fetch',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
      renderBlockingStatus: 'non-blocking',
    };
    _addResourceSpans(transaction, entry, 'https://example.com/assets/to/me', 123, 456, 100);

    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(0);
  });

  it('creates spans for resource spans', () => {
    const entry: ResourceEntry = {
      initiatorType: 'css',
      transferSize: 256,
      encodedBodySize: 456,
      decodedBodySize: 593,
      renderBlockingStatus: 'non-blocking',
    };

    const timeOrigin = 100;
    const startTime = 23;
    const duration = 356;

    _addResourceSpans(transaction, entry, resourceEntryName, startTime, duration, timeOrigin);

    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenLastCalledWith({
      data: {
        ['http.decoded_response_content_length']: entry.decodedBodySize,
        ['http.response_content_length']: entry.encodedBodySize,
        ['http.response_transfer_size']: entry.transferSize,
        ['resource.render_blocking_status']: entry.renderBlockingStatus,
        ['url.scheme']: 'https',
        ['server.address']: 'example.com',
        ['url.same_origin']: true,
      },
      description: '/assets/to/css',
      endTimestamp: timeOrigin + startTime + duration,
      op: 'resource.css',
      origin: 'auto.resource.browser.metrics',
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
      _addResourceSpans(transaction, entry, 'https://example.com/assets/to/me', 123, 234, 465);

      // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
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
      renderBlockingStatus: 'non-blocking',
    };

    _addResourceSpans(transaction, entry, resourceEntryName, 100, 23, 345);

    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: {
          ['http.decoded_response_content_length']: entry.decodedBodySize,
          ['http.response_content_length']: entry.encodedBodySize,
          ['http.response_transfer_size']: entry.transferSize,
          ['resource.render_blocking_status']: entry.renderBlockingStatus,
          ['url.scheme']: 'https',
          ['server.address']: 'example.com',
          ['url.same_origin']: true,
        },
      }),
    );
  });

  it('does not attach resource sizes that exceed MAX_INT bytes', () => {
    const entry: ResourceEntry = {
      initiatorType: 'css',
      transferSize: 2147483647,
      encodedBodySize: 2147483647,
      decodedBodySize: 2147483647,
    };

    _addResourceSpans(transaction, entry, resourceEntryName, 100, 23, 345);

    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { 'server.address': 'example.com', 'url.same_origin': true, 'url.scheme': 'https' },
        description: '/assets/to/css',
        endTimestamp: 468,
        op: 'resource.css',
        origin: 'auto.resource.browser.metrics',
        startTimestamp: 445,
      }),
    );
  });

  // resource sizes can be set as null on some browsers
  // https://github.com/getsentry/sentry/pull/60601
  it('does not attach null resource sizes', () => {
    const entry = {
      initiatorType: 'css',
      transferSize: null,
      encodedBodySize: null,
      decodedBodySize: null,
    } as unknown as ResourceEntry;

    _addResourceSpans(transaction, entry, resourceEntryName, 100, 23, 345);

    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method, deprecation/deprecation
    expect(transaction.startChild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { 'server.address': 'example.com', 'url.same_origin': true, 'url.scheme': 'https' },
        description: '/assets/to/css',
        endTimestamp: 468,
        op: 'resource.css',
        origin: 'auto.resource.browser.metrics',
        startTimestamp: 445,
      }),
    );
  });
});

const setGlobalLocation = (location: Location) => {
  // @ts-expect-error need to override global document
  global.location = mockWindowLocation;

  console.log('\n\n WINDOW origin!! \n\n');
  console.log(WINDOW.location.origin);
  console.log('\n\n');
}

const resetGlobalLocation = () => {
  // @ts-expect-error need to override global document
  global.location = globalLocation;
}
