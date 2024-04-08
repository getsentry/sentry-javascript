import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentrySpan,
  getClient,
  getCurrentScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';
import type { Span } from '@sentry/types';
import type { ResourceEntry } from '../../src/metrics/browserMetrics';
import { _addMeasureSpans, _addResourceSpans } from '../../src/metrics/browserMetrics';
import { WINDOW } from '../../src/metrics/types';
import { TestClient, getDefaultClientOptions } from '../utils/TestClient';

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

const originalLocation = WINDOW.location;

const resourceEntryName = 'https://example.com/assets/to/css';

describe('_addMeasureSpans', () => {
  const span = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();
  });

  it('adds measure spans to a span', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

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

    _addMeasureSpans(span, entry, startTime, duration, timeOrigin);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!)).toEqual(
      expect.objectContaining({
        description: 'measure-1',
        start_timestamp: timeOrigin + startTime,
        timestamp: timeOrigin + startTime + duration,
        op: 'measure',
        origin: 'auto.resource.browser.metrics',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'measure',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
        },
      }),
    );
  });
});

describe('_addResourceSpans', () => {
  const span = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

  beforeAll(() => {
    setGlobalLocation(mockWindowLocation);
  });

  afterAll(() => {
    resetGlobalLocation();
  });

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();
  });

  it('does not create spans for xmlhttprequest', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry: ResourceEntry = {
      initiatorType: 'xmlhttprequest',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
      renderBlockingStatus: 'non-blocking',
    };
    _addResourceSpans(span, entry, resourceEntryName, 123, 456, 100);

    expect(spans).toHaveLength(0);
  });

  it('does not create spans for fetch', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry: ResourceEntry = {
      initiatorType: 'fetch',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
      renderBlockingStatus: 'non-blocking',
    };
    _addResourceSpans(span, entry, 'https://example.com/assets/to/me', 123, 456, 100);

    expect(spans).toHaveLength(0);
  });

  it('creates spans for resource spans', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

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

    _addResourceSpans(span, entry, resourceEntryName, startTime, duration, timeOrigin);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!)).toEqual(
      expect.objectContaining({
        description: '/assets/to/css',
        start_timestamp: timeOrigin + startTime,
        timestamp: timeOrigin + startTime + duration,
        op: 'resource.css',
        origin: 'auto.resource.browser.metrics',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.css',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
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

  it('creates a variety of resource spans', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

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
    for (let i = 0; i < table.length; i++) {
      const { initiatorType, op } = table[i];
      const entry: ResourceEntry = {
        initiatorType,
      };
      _addResourceSpans(span, entry, 'https://example.com/assets/to/me', 123, 234, 465);

      expect(spans).toHaveLength(i + 1);
      expect(spanToJSON(spans[i]!)).toEqual(expect.objectContaining({ op }));
    }
  });

  it('allows for enter size of 0', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry: ResourceEntry = {
      initiatorType: 'css',
      transferSize: 0,
      encodedBodySize: 0,
      decodedBodySize: 0,
      renderBlockingStatus: 'non-blocking',
    };

    _addResourceSpans(span, entry, resourceEntryName, 100, 23, 345);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0])).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.css',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
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
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry: ResourceEntry = {
      initiatorType: 'css',
      transferSize: 2147483647,
      encodedBodySize: 2147483647,
      decodedBodySize: 2147483647,
    };

    _addResourceSpans(span, entry, resourceEntryName, 100, 23, 345);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0])).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.css',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
          'server.address': 'example.com',
          'url.same_origin': true,
          'url.scheme': 'https',
        },
        description: '/assets/to/css',
        timestamp: 468,
        op: 'resource.css',
        origin: 'auto.resource.browser.metrics',
        start_timestamp: 445,
      }),
    );
  });

  // resource sizes can be set as null on some browsers
  // https://github.com/getsentry/sentry/pull/60601
  it('does not attach null resource sizes', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry = {
      initiatorType: 'css',
      transferSize: null,
      encodedBodySize: null,
      decodedBodySize: null,
    } as unknown as ResourceEntry;

    _addResourceSpans(span, entry, resourceEntryName, 100, 23, 345);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0])).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.css',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
          'server.address': 'example.com',
          'url.same_origin': true,
          'url.scheme': 'https',
        },
        description: '/assets/to/css',
        timestamp: 468,
        op: 'resource.css',
        origin: 'auto.resource.browser.metrics',
        start_timestamp: 445,
      }),
    );
  });
});

const setGlobalLocation = (location: Location) => {
  // @ts-expect-error need to delete this in order to set to new value
  delete WINDOW.location;
  WINDOW.location = location;
};

const resetGlobalLocation = () => {
  // @ts-expect-error need to delete this in order to set to new value
  delete WINDOW.location;
  WINDOW.location = originalLocation;
};
