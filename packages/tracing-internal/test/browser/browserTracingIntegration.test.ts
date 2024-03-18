import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  TRACING_DEFAULTS,
  getActiveSpan,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  setCurrentClient,
  spanIsSampled,
  spanToJSON,
  startInactiveSpan,
} from '@sentry/core';
import type { Span, StartSpanOptions } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';
import { JSDOM } from 'jsdom';
import { browserTracingIntegration, startBrowserTracingNavigationSpan, startBrowserTracingPageLoadSpan } from '../..';
import { WINDOW } from '../../src/browser/types';
import { TestClient, getDefaultClientOptions } from '../utils/TestClient';

// We're setting up JSDom here because the Next.js routing instrumentations requires a few things to be present on pageload:
// 1. Access to window.document API for `window.document.getElementById`
// 2. Access to window.location API for `window.location.pathname`

const dom = new JSDOM(undefined, { url: 'https://example.com/' });
Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });
Object.defineProperty(global, 'history', { value: dom.window.history, writable: true });

const originalGlobalDocument = WINDOW.document;
const originalGlobalLocation = WINDOW.location;
const originalGlobalHistory = WINDOW.history;
afterAll(() => {
  // Clean up JSDom
  Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
  Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
  Object.defineProperty(WINDOW, 'history', { value: originalGlobalHistory });
});

describe('browserTracingIntegration', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getCurrentScope().setClient(undefined);
    document.head.innerHTML = '';
  });

  afterEach(() => {
    getActiveSpan()?.end();
  });

  it('works with tracing enabled', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(true);
    expect(spanToJSON(span!)).toEqual({
      description: '/',
      op: 'pageload',
      origin: 'auto.pageload.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });
  });

  it('works with tracing disabled', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeUndefined();
  });

  it("doesn't create a pageload span when instrumentPageLoad is false", () => {
    const client = new TestClient(
      getDefaultClientOptions({
        integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).not.toBeDefined();
  });

  it('works with tracing enabled but unsampled', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 0,
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(false);
  });

  it('starts navigation when URL changes', () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(true);
    expect(span!.isRecording()).toBe(true);
    expect(spanToJSON(span!)).toEqual({
      description: '/',
      op: 'pageload',
      origin: 'auto.pageload.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });

    // this is what is used to get the span name - JSDOM does not update this on it's own!
    const dom = new JSDOM(undefined, { url: 'https://example.com/test' });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

    WINDOW.history.pushState({}, '', '/test');

    expect(span!.isRecording()).toBe(false);

    const span2 = getActiveSpan();
    expect(span2).toBeDefined();
    expect(spanIsSampled(span2!)).toBe(true);
    expect(span2!.isRecording()).toBe(true);
    expect(spanToJSON(span2!)).toEqual({
      description: '/test',
      op: 'navigation',
      origin: 'auto.navigation.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });

    // this is what is used to get the span name - JSDOM does not update this on it's own!
    const dom2 = new JSDOM(undefined, { url: 'https://example.com/test2' });
    Object.defineProperty(global, 'location', { value: dom2.window.document.location, writable: true });

    WINDOW.history.pushState({}, '', '/test2');

    expect(span2!.isRecording()).toBe(false);

    const span3 = getActiveSpan();
    expect(span3).toBeDefined();
    expect(spanIsSampled(span3!)).toBe(true);
    expect(span3!.isRecording()).toBe(true);
    expect(spanToJSON(span3!)).toEqual({
      description: '/test2',
      op: 'navigation',
      origin: 'auto.navigation.browser',
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser',
        [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      trace_id: expect.any(String),
    });
  });

  it("trims pageload transactions to the max duration of the transaction's children", async () => {
    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration({ idleTimeout: 10 })],
      }),
    );

    setCurrentClient(client);
    client.init();

    const pageloadSpan = getActiveSpan();
    const childSpan = startInactiveSpan({ name: 'pageload-child' });
    const timestamp = timestampInSeconds();

    childSpan.end(timestamp);

    // Wait for 10ms for idle timeout
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(spanToJSON(pageloadSpan!).timestamp).toBe(timestamp);
  });

  describe('startBrowserTracingPageLoadSpan', () => {
    it('works without integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(span).toBeUndefined();
    });

    it('works with unsampled span', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanIsSampled(span!)).toBe(false);
    });

    it('works with integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'pageload',
        origin: 'manual',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
      expect(spanIsSampled(span!)).toBe(true);
    });

    it('allows to overwrite properties', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, {
        name: 'test span',
        attributes: {
          testy: 'yes',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
        },
      });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'pageload',
        origin: 'auto.test',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
          testy: 'yes',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    });

    it('calls before beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => options);

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({ instrumentPageLoad: false, beforeStartSpan: mockBeforeStartSpan }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(mockBeforeStartSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test span',
          op: 'pageload',
        }),
      );
    });

    it('uses options overridden with beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
        ...options,
        op: 'test op',
      }));

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      const pageloadSpan = getActiveSpan();

      expect(spanToJSON(pageloadSpan!).op).toBe('test op');
    });

    it('sets the pageload span name on `scope.transactionName`', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingPageLoadSpan(client, { name: 'test pageload span' });

      expect(getCurrentScope().getScopeData().transactionName).toBe('test pageload span');
    });
  });

  it('sets source to "custom" if name is changed in beforeStartSpan', () => {
    const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
      ...options,
      name: 'changed',
    }));

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 0,
        integrations: [
          browserTracingIntegration({
            instrumentPageLoad: false,
            instrumentNavigation: false,
            beforeStartSpan: mockBeforeStartSpan,
          }),
        ],
      }),
    );
    setCurrentClient(client);
    client.init();

    startBrowserTracingPageLoadSpan(client, { name: 'test span' });

    const pageloadSpan = getActiveSpan();

    expect(spanToJSON(pageloadSpan!).description).toBe('changed');
    expect(spanToJSON(pageloadSpan!).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
  });

  describe('startBrowserTracingNavigationSpan', () => {
    it('works without integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(span).toBeUndefined();
    });

    it('works with unsampled span', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [browserTracingIntegration({ instrumentNavigation: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanIsSampled(span!)).toBe(false);
    });

    it('works with integration setup', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentNavigation: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'navigation',
        origin: 'manual',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
      expect(spanIsSampled(span!)).toBe(true);
    });

    it('allows to overwrite properties', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentNavigation: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, {
        name: 'test span',
        attributes: {
          testy: 'yes',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
        },
      });

      expect(span).toBeDefined();
      expect(spanToJSON(span!)).toEqual({
        description: 'test span',
        op: 'navigation',
        origin: 'auto.test',
        data: {
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom',
          testy: 'yes',
        },
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        trace_id: expect.any(String),
      });
    });

    it('calls before beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => options);

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(mockBeforeStartSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test span',
          op: 'navigation',
        }),
      );
    });

    it('uses options overridden with beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
        ...options,
        op: 'test op',
      }));

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingNavigationSpan(client, { name: 'test span' });

      const navigationSpan = getActiveSpan();

      expect(spanToJSON(navigationSpan!).op).toBe('test op');
    });

    it('sets source to "custom" if name is changed in beforeStartSpan', () => {
      const mockBeforeStartSpan = jest.fn((options: StartSpanOptions) => ({
        ...options,
        name: 'changed',
      }));

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 0,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              beforeStartSpan: mockBeforeStartSpan,
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingNavigationSpan(client, { name: 'test span' });

      const pageloadSpan = getActiveSpan();

      expect(spanToJSON(pageloadSpan!).description).toBe('changed');
      expect(spanToJSON(pageloadSpan!).data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
    });

    it('sets the pageload span name on `scope.transactionName`', () => {
      const client = new TestClient(
        getDefaultClientOptions({
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingPageLoadSpan(client, { name: 'test navigation span' });

      expect(getCurrentScope().getScopeData().transactionName).toBe('test navigation span');
    });
  });

  describe('using the <meta> tag data', () => {
    it('uses the tracing data for pageload span', () => {
      // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);

      // pageload transactions are created as part of the browserTracingIntegration's initialization
      client.init();

      const idleSpan = getActiveSpan()!;
      expect(idleSpan).toBeDefined();

      const dynamicSamplingContext = getDynamicSamplingContextFromSpan(idleSpan!);
      const propagationContext = getCurrentScope().getPropagationContext();

      // Span is correct
      expect(spanToJSON(idleSpan).op).toBe('pageload');
      expect(spanToJSON(idleSpan).trace_id).toEqual('12312012123120121231201212312012');
      expect(spanToJSON(idleSpan).parent_span_id).toEqual('1121201211212012');
      expect(spanIsSampled(idleSpan)).toBe(false);

      expect(dynamicSamplingContext).toBeDefined();
      expect(dynamicSamplingContext).toStrictEqual({ release: '2.1.14' });

      // Propagation context is reset and does not contain the meta tag data
      expect(propagationContext.traceId).not.toEqual('12312012123120121231201212312012');
      expect(propagationContext.parentSpanId).not.toEqual('1121201211212012');
    });

    it('puts frozen Dynamic Sampling Context on pageload span if sentry-trace data and only 3rd party baggage is present', () => {
      // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="foo=bar">';

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);

      // pageload transactions are created as part of the browserTracingIntegration's initialization
      client.init();

      const idleSpan = getActiveSpan()!;
      expect(idleSpan).toBeDefined();

      const dynamicSamplingContext = getDynamicSamplingContextFromSpan(idleSpan);
      const propagationContext = getCurrentScope().getPropagationContext();

      // Span is correct
      expect(spanToJSON(idleSpan).op).toBe('pageload');
      expect(spanToJSON(idleSpan).trace_id).toEqual('12312012123120121231201212312012');
      expect(spanToJSON(idleSpan).parent_span_id).toEqual('1121201211212012');
      expect(spanIsSampled(idleSpan)).toBe(false);

      expect(dynamicSamplingContext).toBeDefined();
      expect(dynamicSamplingContext).toStrictEqual({});

      // Propagation context is reset and does not contain the meta tag data
      expect(propagationContext.traceId).not.toEqual('12312012123120121231201212312012');
      expect(propagationContext.parentSpanId).not.toEqual('1121201211212012');
    });

    it('ignores the meta tag data for navigation spans', () => {
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="sentry-release=2.1.14">';

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);

      // pageload transactions are created as part of the browserTracingIntegration's initialization
      client.init();

      // this is what is used to get the span name - JSDOM does not update this on it's own!
      const dom = new JSDOM(undefined, { url: 'https://example.com/navigation-test' });
      Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

      WINDOW.history.pushState({}, '', '/navigation-test');

      const idleSpan = getActiveSpan()!;
      expect(idleSpan).toBeDefined();

      const dynamicSamplingContext = getDynamicSamplingContextFromSpan(idleSpan);
      const propagationContext = getCurrentScope().getPropagationContext();

      // Span is correct
      expect(spanToJSON(idleSpan).op).toBe('navigation');
      expect(spanToJSON(idleSpan).trace_id).not.toEqual('12312012123120121231201212312012');
      expect(spanToJSON(idleSpan).parent_span_id).not.toEqual('1121201211212012');
      expect(spanIsSampled(idleSpan)).toBe(true);

      expect(dynamicSamplingContext).toBeDefined();
      expect(dynamicSamplingContext).toStrictEqual({
        environment: 'production',
        public_key: 'username',
        sample_rate: '1',
        sampled: 'true',
        trace_id: expect.not.stringContaining('12312012123120121231201212312012'),
      });

      // Propagation context is correct
      expect(propagationContext.traceId).not.toEqual('12312012123120121231201212312012');
      expect(propagationContext.parentSpanId).not.toEqual('1121201211212012');
    });

    it('uses passed in tracing data for pageload span over meta tags', () => {
      // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-1">' +
        '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);

      client.init();

      // manually create a pageload span with tracing data
      startBrowserTracingPageLoadSpan(
        client,
        {
          name: 'test span',
        },
        {
          sentryTrace: '12312012123120121231201212312011-1121201211212011-1',
          baggage: 'sentry-release=2.2.14,foo=bar',
        },
      );

      const idleSpan = getActiveSpan()!;
      expect(idleSpan).toBeDefined();

      const dynamicSamplingContext = getDynamicSamplingContextFromSpan(idleSpan!);
      const propagationContext = getCurrentScope().getPropagationContext();

      // Span is correct
      expect(spanToJSON(idleSpan).op).toBe('pageload');
      expect(spanToJSON(idleSpan).trace_id).toEqual('12312012123120121231201212312011');
      expect(spanToJSON(idleSpan).parent_span_id).toEqual('1121201211212011');
      expect(spanIsSampled(idleSpan)).toBe(true);

      expect(dynamicSamplingContext).toBeDefined();
      expect(dynamicSamplingContext).toStrictEqual({ release: '2.2.14' });

      // Propagation context is reset and does not contain the meta tag data
      expect(propagationContext.traceId).not.toEqual('12312012123120121231201212312012');
      expect(propagationContext.parentSpanId).not.toEqual('1121201211212012');
    });
  });

  describe('idleTimeout', () => {
    it('is created by default', () => {
      jest.useFakeTimers();
      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);
      client.init();

      const spans: Span[] = [];
      client.on('spanEnd', span => {
        spans.push(span);
      });

      const idleSpan = getActiveSpan();
      expect(idleSpan).toBeDefined();

      client.emit('idleSpanEnableAutoFinish', idleSpan!);

      const span = startInactiveSpan({ name: 'inner1' });
      span?.end(); // activities = 0

      // inner1 is now ended, all good
      expect(spans).toHaveLength(1);

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);

      // idle span itself is now ended
      expect(spans).toHaveLength(2);
      expect(spans[1]).toBe(idleSpan);
    });

    it('can be a custom value', () => {
      jest.useFakeTimers();

      const client = new TestClient(
        getDefaultClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ idleTimeout: 2000 })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const spans: Span[] = [];
      client.on('spanEnd', span => {
        spans.push(span);
      });

      const idleSpan = getActiveSpan();
      expect(idleSpan).toBeDefined();

      client.emit('idleSpanEnableAutoFinish', idleSpan!);

      const span = startInactiveSpan({ name: 'inner1' });
      span?.end(); // activities = 0

      // inner1 is now ended, all good
      expect(spans).toHaveLength(1);

      jest.advanceTimersByTime(2000);

      // idle span itself is now ended
      expect(spans).toHaveLength(2);
      expect(spans[1]).toBe(idleSpan);
    });
  });

  // TODO(lforst): I cannot manage to get this test to pass.
  /*
  it('heartbeatInterval can be a custom value', () => {
    jest.useFakeTimers();

    const interval = 200;

    const client = new TestClient(
      getDefaultClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration({ heartbeatInterval: interval })],
      }),
    );

    setCurrentClient(client);
    client.init();

    const mockFinish = jest.fn();
    // eslint-disable-next-line deprecation/deprecation
    const transaction = getActiveTransaction() as IdleTransaction;
    transaction.sendAutoFinishSignal();
    transaction.end = mockFinish;

    const span = startInactiveSpan({ name: 'child-span' }); // activities = 1
    span!.end(); // activities = 0

    expect(mockFinish).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(interval * 3);
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });
  */
});
