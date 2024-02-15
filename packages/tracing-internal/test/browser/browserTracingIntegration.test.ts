import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getActiveSpan,
  getCurrentScope,
  setCurrentClient,
  spanIsSampled,
  spanToJSON,
} from '@sentry/core';
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
  afterEach(() => {
    getCurrentScope().clear();
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
    expect(span).toBeDefined();
    expect(spanIsSampled(span!)).toBe(false);
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
        origin: 'auto.test',
        attributes: { testy: 'yes' },
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
        origin: 'auto.test',
        attributes: { testy: 'yes' },
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
  });
});
