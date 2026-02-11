import type { Span, SpanAttributes } from '@sentry/core';
import {
  getClient,
  getCurrentScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentrySpan,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  _addMeasureSpans,
  _addNavigationSpans,
  _addResourceSpans,
  _setResourceRequestAttributes,
} from '../../src/metrics/browserMetrics';
import { WINDOW } from '../../src/types';
import { getDefaultClientOptions, TestClient } from '../utils/TestClient';

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

interface AdditionalPerformanceResourceTiming {
  renderBlockingStatus?: 'non-blocking' | 'blocking' | '';
  deliveryType?: 'cache' | 'navigational-prefetch' | '';
}

function mockPerformanceResourceTiming(
  data: Partial<PerformanceResourceTiming> & AdditionalPerformanceResourceTiming,
): PerformanceResourceTiming & AdditionalPerformanceResourceTiming {
  return data as PerformanceResourceTiming & AdditionalPerformanceResourceTiming;
}

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

    const entry = {
      entryType: 'measure',
      name: 'measure-1',
      duration: 10,
      startTime: 12,
    } as PerformanceEntry;

    const timeOrigin = 100;
    const startTime = 23;
    const duration = 356;

    _addMeasureSpans(span, entry, startTime, duration, timeOrigin, []);

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

  it('drops measurement spans with negative duration', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry = {
      entryType: 'measure',
      name: 'measure-1',
      duration: 10,
      startTime: 12,
    } as PerformanceEntry;

    const timeOrigin = 100;
    const startTime = 23;
    const duration = -50;

    _addMeasureSpans(span, entry, startTime, duration, timeOrigin, []);

    expect(spans).toHaveLength(0);
  });

  it('ignores performance spans that match ignorePerformanceApiSpans', () => {
    const pageloadSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entries: PerformanceEntry[] = [
      {
        entryType: 'measure',
        name: 'measure-pass',
        duration: 10,
        startTime: 12,
        toJSON: () => ({}),
      },
      {
        entryType: 'measure',
        name: 'measure-ignore',
        duration: 10,
        startTime: 12,
        toJSON: () => ({}),
      },
      {
        entryType: 'mark',
        name: 'mark-pass',
        duration: 0,
        startTime: 12,
        toJSON: () => ({}),
      },
      {
        entryType: 'mark',
        name: 'mark-ignore',
        duration: 0,
        startTime: 12,
        toJSON: () => ({}),
      },
      {
        entryType: 'paint',
        name: 'mark-ignore',
        duration: 0,
        startTime: 12,
        toJSON: () => ({}),
      },
    ];

    const timeOrigin = 100;
    const startTime = 23;
    const duration = 356;

    entries.forEach(e => {
      _addMeasureSpans(pageloadSpan, e, startTime, duration, timeOrigin, ['measure-i', /mark-ign/]);
    });

    expect(spans).toHaveLength(3);
    expect(spans.map(spanToJSON)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: 'measure-pass', op: 'measure' }),
        expect.objectContaining({ description: 'mark-pass', op: 'mark' }),
        // name matches but type is not (mark|measure) => should not be ignored
        expect.objectContaining({ description: 'mark-ignore', op: 'paint' }),
      ]),
    );
  });

  it('ignores React 19.2+ measure spans', () => {
    const pageloadSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entries: PerformanceMeasure[] = [
      {
        entryType: 'measure',
        name: '\u200bLayout',
        duration: 0.3,
        startTime: 12,
        detail: {
          devtools: {
            track: 'Components ⚛',
          },
        },
        toJSON: () => ({ foo: 'bar' }),
      },
      {
        entryType: 'measure',
        name: '\u200bButton',
        duration: 0.1,
        startTime: 13,
        detail: {
          devtools: {
            track: 'Components ⚛',
          },
        },
        toJSON: () => ({}),
      },
      {
        entryType: 'measure',
        name: 'Unmount',
        duration: 0.1,
        startTime: 14,
        detail: {
          devtools: {
            track: 'Components ⚛',
          },
        },
        toJSON: () => ({}),
      },
      {
        entryType: 'measure',
        name: 'my-measurement',
        duration: 0,
        startTime: 12,
        detail: null,
        toJSON: () => ({}),
      },
    ];

    const timeOrigin = 100;
    const startTime = 23;
    const duration = 356;

    entries.forEach(e => {
      _addMeasureSpans(pageloadSpan, e, startTime, duration, timeOrigin, []);
    });

    expect(spans).toHaveLength(1);
    expect(spans.map(spanToJSON)).toEqual(
      expect.arrayContaining([expect.objectContaining({ description: 'my-measurement', op: 'measure' })]),
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

    const entry = mockPerformanceResourceTiming({
      initiatorType: 'xmlhttprequest',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
      renderBlockingStatus: 'non-blocking',
      nextHopProtocol: 'http/1.1',
    });
    _addResourceSpans(span, entry, resourceEntryName, 123, 456, 100);

    expect(spans).toHaveLength(0);
  });

  it('does not create spans for fetch', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry = mockPerformanceResourceTiming({
      initiatorType: 'fetch',
      transferSize: 256,
      encodedBodySize: 256,
      decodedBodySize: 256,
      renderBlockingStatus: 'non-blocking',
      nextHopProtocol: 'http/1.1',
    });
    _addResourceSpans(span, entry, 'https://example.com/assets/to/me', 123, 456, 100);

    expect(spans).toHaveLength(0);
  });

  it('creates spans for resource spans', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry = mockPerformanceResourceTiming({
      initiatorType: 'css',
      transferSize: 256,
      encodedBodySize: 456,
      decodedBodySize: 593,
      renderBlockingStatus: 'non-blocking',
      nextHopProtocol: 'http/1.1',
      connectStart: 1000,
      connectEnd: 1001,
      redirectStart: 1002,
      redirectEnd: 1003,
      fetchStart: 1004,
      domainLookupStart: 1005,
      domainLookupEnd: 1006,
      requestStart: 1007,
      responseStart: 1008,
      responseEnd: 1009,
      secureConnectionStart: 1005,
      workerStart: 1006,
    });

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
          ['network.protocol.name']: 'http',
          ['network.protocol.version']: '1.1',
          'http.request.connect_start': expect.any(Number),
          'http.request.connection_end': expect.any(Number),
          'http.request.domain_lookup_end': expect.any(Number),
          'http.request.domain_lookup_start': expect.any(Number),
          'http.request.fetch_start': expect.any(Number),
          'http.request.redirect_end': expect.any(Number),
          'http.request.redirect_start': expect.any(Number),
          'http.request.request_start': expect.any(Number),
          'http.request.response_end': expect.any(Number),
          'http.request.response_start': expect.any(Number),
          'http.request.secure_connection_start': expect.any(Number),
          'http.request.time_to_first_byte': 1.008,
          'http.request.worker_start': expect.any(Number),
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
      const { initiatorType, op } = table[i]!;
      const entry = mockPerformanceResourceTiming({
        initiatorType,
        nextHopProtocol: 'http/1.1',
      });
      _addResourceSpans(span, entry, 'https://example.com/assets/to/me', 123, 234, 465);

      expect(spans).toHaveLength(i + 1);
      expect(spanToJSON(spans[i]!)).toEqual(expect.objectContaining({ op }));
    }
  });

  it('allows resource spans to be ignored via ignoreResourceSpans', () => {
    const spans: Span[] = [];
    const ignoredResourceSpans = ['resource.other', 'resource.script'];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const table = [
      {
        initiatorType: undefined,
        op: 'resource.other',
      },
      {
        initiatorType: 'css',
        op: 'resource.css',
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
    for (const row of table) {
      const { initiatorType } = row;
      const entry = mockPerformanceResourceTiming({
        initiatorType,
        nextHopProtocol: 'http/1.1',
      });
      _addResourceSpans(span, entry, 'https://example.com/assets/to/me', 123, 234, 465, ignoredResourceSpans);
    }
    expect(spans).toHaveLength(table.length - ignoredResourceSpans.length);
    const spanOps = new Set(
      spans.map(s => {
        return spanToJSON(s).op;
      }),
    );
    expect(spanOps).toEqual(new Set(['resource.css', 'resource.image']));
  });

  it('allows for enter size of 0', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry = mockPerformanceResourceTiming({
      initiatorType: 'css',
      transferSize: 0,
      encodedBodySize: 0,
      decodedBodySize: 0,
      renderBlockingStatus: 'non-blocking',
      nextHopProtocol: 'h2',
    });

    _addResourceSpans(span, entry, resourceEntryName, 100, 23, 345);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!)).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.css',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
          ['http.decoded_response_content_length']: entry.decodedBodySize,
          ['http.response_content_length']: entry.encodedBodySize,
          ['http.response_transfer_size']: entry.transferSize,
          ['resource.render_blocking_status']: entry.renderBlockingStatus,
          ['url.scheme']: 'https',
          ['server.address']: 'example.com',
          ['url.same_origin']: true,
          ['network.protocol.name']: 'http',
          ['network.protocol.version']: '2',
        }),
      }),
    );
  });

  it('does not attach resource sizes that exceed MAX_INT bytes', () => {
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    const entry = mockPerformanceResourceTiming({
      initiatorType: 'css',
      transferSize: 2147483647,
      encodedBodySize: 2147483647,
      decodedBodySize: 2147483647,
      nextHopProtocol: 'h3',
    });

    _addResourceSpans(span, entry, resourceEntryName, 100, 23, 345);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!)).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.css',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
          'server.address': 'example.com',
          'url.same_origin': true,
          'url.scheme': 'https',
          ['network.protocol.name']: 'http',
          ['network.protocol.version']: '3',
        }),
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
      nextHopProtocol: 'h3',
      connectStart: 1000,
      connectEnd: 1001,
      redirectStart: 1002,
      redirectEnd: 1003,
      fetchStart: 1004,
      domainLookupStart: 1005,
      domainLookupEnd: 1006,
      requestStart: 1007,
      responseStart: 1008,
      responseEnd: 1009,
      secureConnectionStart: 1005,
      workerStart: 1006,
    } as unknown as PerformanceResourceTiming;

    _addResourceSpans(span, entry, resourceEntryName, 100, 23, 345);

    expect(spans).toHaveLength(1);
    expect(spanToJSON(spans[0]!)).toEqual(
      expect.objectContaining({
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'resource.css',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.resource.browser.metrics',
          'server.address': 'example.com',
          'url.same_origin': true,
          'url.scheme': 'https',
          ['network.protocol.name']: 'http',
          ['network.protocol.version']: '3',
          'http.request.connect_start': expect.any(Number),
          'http.request.connection_end': expect.any(Number),
          'http.request.domain_lookup_end': expect.any(Number),
          'http.request.domain_lookup_start': expect.any(Number),
          'http.request.fetch_start': expect.any(Number),
          'http.request.redirect_end': expect.any(Number),
          'http.request.redirect_start': expect.any(Number),
          'http.request.request_start': expect.any(Number),
          'http.request.response_end': expect.any(Number),
          'http.request.response_start': expect.any(Number),
          'http.request.secure_connection_start': expect.any(Number),
          'http.request.time_to_first_byte': 1.008,
          'http.request.worker_start': expect.any(Number),
        },
        description: '/assets/to/css',
        timestamp: 468,
        op: 'resource.css',
        origin: 'auto.resource.browser.metrics',
        start_timestamp: 445,
      }),
    );
  });

  // resource delivery types: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
  // i.e. better but not yet widely supported way to check for browser cache hit
  it.each(['cache', 'navigational-prefetch', ''] as const)(
    'attaches delivery type ("%s") to resource spans if available',
    deliveryType => {
      const spans: Span[] = [];

      getClient()?.on('spanEnd', span => {
        spans.push(span);
      });

      const entry = mockPerformanceResourceTiming({
        initiatorType: 'css',
        transferSize: 0,
        encodedBodySize: 0,
        decodedBodySize: 0,
        deliveryType,
        nextHopProtocol: 'h3',
      });

      _addResourceSpans(span, entry, resourceEntryName, 100, 23, 345);

      expect(spans).toHaveLength(1);
      expect(spanToJSON(spans[0]!).data).toMatchObject({ 'http.response_delivery_type': deliveryType });
    },
  );
});

describe('_addNavigationSpans', () => {
  const pageloadSpan = new SentrySpan({ op: 'pageload', name: '/', sampled: true });

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

  it('adds navigation spans based on the navigation performance entry', () => {
    // entry taken from a real entry via browser dev tools
    const entry: PerformanceNavigationTiming = {
      name: 'https://santry.com/test',
      entryType: 'navigation',
      startTime: 0,
      duration: 546.1000000014901,
      initiatorType: 'navigation',
      nextHopProtocol: 'h2',
      workerStart: 0,
      redirectStart: 7.5,
      redirectEnd: 20.5,
      redirectCount: 2,
      fetchStart: 4.9000000059604645,
      domainLookupStart: 4.9000000059604645,
      domainLookupEnd: 4.9000000059604645,
      connectStart: 4.9000000059604645,
      secureConnectionStart: 4.9000000059604645,
      connectEnd: 4.9000000059604645,
      requestStart: 7.9000000059604645,
      responseStart: 396.80000000447035,
      responseEnd: 416.40000000596046,
      transferSize: 14726,
      encodedBodySize: 14426,
      decodedBodySize: 67232,
      responseStatus: 200,
      serverTiming: [],
      unloadEventStart: 0,
      unloadEventEnd: 0,
      domInteractive: 473.20000000298023,
      domContentLoadedEventStart: 480.1000000014901,
      domContentLoadedEventEnd: 480.30000000447035,
      domComplete: 546,
      loadEventStart: 546,
      loadEventEnd: 546.1000000014901,
      type: 'navigate',
      activationStart: 0,
      toJSON: () => ({}),
    };
    const spans: Span[] = [];

    getClient()?.on('spanEnd', span => {
      spans.push(span);
    });

    _addNavigationSpans(pageloadSpan, entry, 999);

    const trace_id = pageloadSpan.spanContext().traceId;
    const parent_span_id = pageloadSpan.spanContext().spanId;

    expect(spans).toHaveLength(9);
    expect(spans.map(spanToJSON)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.domContentLoadedEvent',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.domContentLoadedEvent',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.loadEvent',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.loadEvent',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.connect',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.connect',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.TLS/SSL',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.TLS/SSL',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.cache',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.cache',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.DNS',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.DNS',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.request',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.request',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'sentry.op': 'browser.response',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.response',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
        expect.objectContaining({
          data: {
            'http.redirect_count': 2,
            'sentry.op': 'browser.redirect',
            'sentry.origin': 'auto.ui.browser.metrics',
          },
          description: 'https://santry.com/test',
          op: 'browser.redirect',
          origin: 'auto.ui.browser.metrics',
          parent_span_id,
          trace_id,
        }),
      ]),
    );
  });
});

describe('_setResourceRequestAttributes', () => {
  it('sets resource request attributes', () => {
    const attributes: SpanAttributes = {};

    const entry = mockPerformanceResourceTiming({
      transferSize: 0,
      deliveryType: 'cache',
      renderBlockingStatus: 'non-blocking',
      responseStatus: 200,
      redirectStart: 100,
      responseStart: 200,
    });

    _setResourceRequestAttributes(entry, attributes, [
      ['transferSize', 'http.response_transfer_size'],
      ['deliveryType', 'http.response_delivery_type'],
      ['renderBlockingStatus', 'resource.render_blocking_status'],
      ['responseStatus', 'http.response.status_code'],
      ['redirectStart', 'http.request.redirect_start'],
      ['responseStart', 'http.response.start'],
    ]);

    expect(attributes).toEqual({
      'http.response_transfer_size': 0,
      'http.request.redirect_start': 100,
      'http.response.start': 200,
      'http.response.status_code': 200,
      'http.response_delivery_type': 'cache',
      'resource.render_blocking_status': 'non-blocking',
    });
  });

  it("doesn't set other attributes", () => {
    const attributes: SpanAttributes = {};

    const entry = mockPerformanceResourceTiming({
      transferSize: 0,
      deliveryType: 'cache',
      renderBlockingStatus: 'non-blocking',
    });

    _setResourceRequestAttributes(entry, attributes, [['transferSize', 'http.response_transfer_size']]);

    expect(attributes).toEqual({
      'http.response_transfer_size': 0,
    });
  });

  it("doesn't set non-primitive or undefined values", () => {
    const attributes: SpanAttributes = {};

    const entry = mockPerformanceResourceTiming({
      transferSize: undefined,
      // @ts-expect-error null is invalid but let's test it anyway
      deliveryType: null,
      // @ts-expect-error object is invalid but let's test it anyway
      renderBlockingStatus: { blocking: 'non-blocking' },
    });

    _setResourceRequestAttributes(entry, attributes, [
      ['transferSize', 'http.response_transfer_size'],
      ['deliveryType', 'http.response_delivery_type'],
      ['renderBlockingStatus', 'resource.render_blocking_status'],
    ]);

    expect(attributes).toEqual({});
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
