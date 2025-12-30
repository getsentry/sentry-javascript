/**
 * @vitest-environment jsdom
 */

import type { Span, StartSpanOptions } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCurrentClient,
  spanIsSampled,
  spanToJSON,
  startInactiveSpan,
  TRACING_DEFAULTS,
} from '@sentry/core';
import { JSDOM } from 'jsdom';
import { TextDecoder, TextEncoder } from 'util';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/client';
import { WINDOW } from '../../src/helpers';
import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '../../src/tracing/browserTracingIntegration';
import { PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE } from '../../src/tracing/linkedTraces';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

const oldTextEncoder = global.window.TextEncoder;
const oldTextDecoder = global.window.TextDecoder;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
delete global.window.TextEncoder;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
delete global.window.TextDecoder;
global.window.TextEncoder = TextEncoder;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
global.window.TextDecoder = TextDecoder;

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

describe('browserTracingIntegration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getCurrentScope().clear();
    getIsolationScope().clear();
    getCurrentScope().setClient(undefined);
    document.head.innerHTML = '';

    const dom = new JSDOM(undefined, { url: 'https://example.com/' });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

    // We want to suppress the "Multiple browserTracingIntegration instances are not supported." warnings
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    getActiveSpan()?.end();
    vi.useRealTimers();
    performance.clearMarks();
  });

  afterAll(() => {
    global.window.TextEncoder = oldTextEncoder;
    global.window.TextDecoder = oldTextDecoder;
    // Clean up JSDom
    Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
    Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
    Object.defineProperty(WINDOW, 'history', { value: originalGlobalHistory });
  });

  it('works with tracing enabled', () => {
    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
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
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });
  });

  it('works with tracing disabled', () => {
    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
        integrations: [browserTracingIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).toBeUndefined();
  });

  it("doesn't create a pageload span when instrumentPageLoad is false", () => {
    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
        integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
      }),
    );
    setCurrentClient(client);
    client.init();

    const span = getActiveSpan();
    expect(span).not.toBeDefined();
  });

  it('works with tracing enabled but unsampled', () => {
    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
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

  it('starts navigation when URL changes after > 1.5s', () => {
    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
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
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });

    // this is what is used to get the span name - JSDOM does not update this on it's own!
    const dom = new JSDOM(undefined, { url: 'https://example.com/test' });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

    vi.advanceTimersByTime(1600);
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
        [PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE]: `${span?.spanContext().traceId}-${span?.spanContext().spanId}-1`,
      },
      links: [
        {
          attributes: {
            'sentry.link.type': 'previous_trace',
          },
          sampled: true,
          span_id: span?.spanContext().spanId,
          trace_id: span?.spanContext().traceId,
        },
      ],
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
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
        [PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE]: `${span2?.spanContext().traceId}-${span2?.spanContext().spanId}-1`,
      },
      links: [
        {
          attributes: {
            'sentry.link.type': 'previous_trace',
          },
          sampled: true,
          span_id: span2?.spanContext().spanId,
          trace_id: span2?.spanContext().traceId,
        },
      ],
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      start_timestamp: expect.any(Number),
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    });
  });

  describe('startBrowserTracingPageLoadSpan', () => {
    it('works without integration setup', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          integrations: [],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingPageLoadSpan(client, { name: 'test span' });

      expect(span).toBeUndefined();
    });

    it('works with unsampled span', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
      expect(spanIsSampled(span!)).toBe(true);
    });

    it('allows to overwrite properties', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
    });

    it('calls before beforeStartSpan', () => {
      const mockBeforeStartSpan = vi.fn((options: StartSpanOptions) => options);

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      const mockBeforeStartSpan = vi.fn((options: StartSpanOptions) => ({
        ...options,
        op: 'test op',
      }));

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
    const mockBeforeStartSpan = vi.fn((options: StartSpanOptions) => ({
      ...options,
      name: 'changed',
    }));

    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
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

    startBrowserTracingPageLoadSpan(client, {
      name: 'test span',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
    });

    const pageloadSpan = getActiveSpan();

    expect(spanToJSON(pageloadSpan!).description).toBe('changed');
    expect(spanToJSON(pageloadSpan!).data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
  });

  it('sets source to "custom" if name is changed in-place in beforeStartSpan', () => {
    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
        tracesSampleRate: 0,
        integrations: [
          browserTracingIntegration({
            instrumentPageLoad: false,
            instrumentNavigation: false,
            beforeStartSpan: opts => {
              opts.name = 'changed';
              return opts;
            },
          }),
        ],
      }),
    );
    setCurrentClient(client);
    client.init();

    startBrowserTracingPageLoadSpan(client, {
      name: 'test span',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
      },
    });

    const pageloadSpan = getActiveSpan();

    expect(spanToJSON(pageloadSpan!).description).toBe('changed');
    expect(spanToJSON(pageloadSpan!).data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
  });

  describe('startBrowserTracingNavigationSpan', () => {
    it('works without integration setup', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          integrations: [],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span = startBrowserTracingNavigationSpan(client, { name: 'test span' });

      expect(span).toBeUndefined();
    });

    it('works with unsampled span', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
          [PREVIOUS_TRACE_TMP_SPAN_ATTRIBUTE]: expect.stringMatching(/[a-f0-9]{32}-[a-f0-9]{16}-1/),
        },
        links: [
          {
            attributes: {
              'sentry.link.type': 'previous_trace',
            },
            sampled: true,
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          },
        ],
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
      expect(spanIsSampled(span!)).toBe(true);
    });

    it('allows to overwrite properties', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
          integrations: [
            browserTracingIntegration({
              instrumentNavigation: false,
              // disabling previous trace b/c not relevant for this test
              linkPreviousTrace: 'off',
            }),
          ],
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
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
    });

    it('calls before beforeStartSpan', () => {
      const mockBeforeStartSpan = vi.fn((options: StartSpanOptions) => options);

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      const mockBeforeStartSpan = vi.fn((options: StartSpanOptions) => ({
        ...options,
        op: 'test op',
      }));

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      const mockBeforeStartSpan = vi.fn((options: StartSpanOptions) => ({
        ...options,
        name: 'changed',
      }));

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      expect(spanToJSON(pageloadSpan!).data[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
    });

    it('sets the navigation span name on `scope.transactionName`', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);
      client.init();

      startBrowserTracingNavigationSpan(client, { name: 'test navigation span' });

      expect(getCurrentScope().getScopeData().transactionName).toBe('test navigation span');
    });

    it("updates the scopes' propagationContexts on a navigation", () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);
      client.init();

      const oldIsolationScopePropCtx = getIsolationScope().getPropagationContext();
      const oldCurrentScopePropCtx = getCurrentScope().getPropagationContext();

      startBrowserTracingNavigationSpan(client, { name: 'test navigation span' });

      const newIsolationScopePropCtx = getIsolationScope().getPropagationContext();
      const newCurrentScopePropCtx = getCurrentScope().getPropagationContext();

      expect(oldCurrentScopePropCtx).toEqual({
        traceId: expect.stringMatching(/[a-f0-9]{32}/),
        propagationSpanId: expect.stringMatching(/[a-f0-9]{16}/),
        sampleRand: expect.any(Number),
      });
      expect(oldIsolationScopePropCtx).toEqual({
        traceId: expect.stringMatching(/[a-f0-9]{32}/),
        sampleRand: expect.any(Number),
      });
      expect(newCurrentScopePropCtx).toEqual({
        traceId: expect.stringMatching(/[a-f0-9]{32}/),
        propagationSpanId: expect.stringMatching(/[a-f0-9]{16}/),
        sampleRand: expect.any(Number),
      });
      expect(newIsolationScopePropCtx).toEqual({
        traceId: expect.stringMatching(/[a-f0-9]{32}/),
        propagationSpanId: expect.stringMatching(/[a-f0-9]{16}/),
        sampleRand: expect.any(Number),
      });

      expect(newIsolationScopePropCtx.traceId).not.toEqual(oldIsolationScopePropCtx.traceId);
      expect(newCurrentScopePropCtx.traceId).not.toEqual(oldCurrentScopePropCtx.traceId);
      expect(newIsolationScopePropCtx.propagationSpanId).not.toEqual(oldIsolationScopePropCtx.propagationSpanId);
    });

    it("saves the span's positive sampling decision and its DSC on the propagationContext when the span finishes", () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const navigationSpan = startBrowserTracingNavigationSpan(client, {
        name: 'mySpan',
        attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' },
      });

      const propCtxBeforeEnd = getCurrentScope().getPropagationContext();
      expect(propCtxBeforeEnd).toEqual({
        sampleRand: expect.any(Number),
        traceId: expect.stringMatching(/[a-f0-9]{32}/),
      });

      navigationSpan!.end();

      const propCtxAfterEnd = getCurrentScope().getPropagationContext();
      expect(propCtxAfterEnd).toEqual({
        traceId: propCtxBeforeEnd.traceId,
        sampled: true,
        sampleRand: expect.any(Number),
        dsc: {
          release: undefined,
          org_id: undefined,
          environment: 'production',
          public_key: 'examplePublicKey',
          sample_rate: '1',
          sampled: 'true',
          transaction: 'mySpan',
          trace_id: propCtxBeforeEnd.traceId,
          sample_rand: expect.any(String),
        },
      });
    });

    it("saves the span's negative sampling decision and its DSC on the propagationContext when the span finishes", () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          tracesSampleRate: 0,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const navigationSpan = startBrowserTracingNavigationSpan(client, {
        name: 'mySpan',
        attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' },
      });

      const propCtxBeforeEnd = getCurrentScope().getPropagationContext();
      expect(propCtxBeforeEnd).toEqual({
        traceId: expect.stringMatching(/[a-f0-9]{32}/),
        sampleRand: expect.any(Number),
      });

      navigationSpan!.end();

      const propCtxAfterEnd = getCurrentScope().getPropagationContext();
      expect(propCtxAfterEnd).toEqual({
        traceId: propCtxBeforeEnd.traceId,
        sampled: false,
        sampleRand: expect.any(Number),
        dsc: {
          release: undefined,
          org_id: undefined,
          environment: 'production',
          public_key: 'examplePublicKey',
          sample_rate: '0',
          sampled: 'false',
          transaction: 'mySpan',
          trace_id: propCtxBeforeEnd.traceId,
          sample_rand: expect.any(String),
        },
      });
    });

    it('triggers beforeStartNavigationSpan hook listeners', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration()],
        }),
      );
      setCurrentClient(client);

      const mockBeforeStartNavigationSpanCallback = vi.fn((options: StartSpanOptions) => options);

      client.on('beforeStartNavigationSpan', mockBeforeStartNavigationSpanCallback);

      startBrowserTracingNavigationSpan(client, { name: 'test span', op: 'navigation' });

      expect(mockBeforeStartNavigationSpanCallback).toHaveBeenCalledWith(
        { name: 'test span', op: 'navigation' },
        { isRedirect: undefined },
      );
    });
  });

  describe('using the <meta> tag data', () => {
    it('uses the tracing data for pageload span', () => {
      // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="sentry-release=2.1.14,foo=bar,sentry-sample_rand=0.123">';

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      expect(dynamicSamplingContext).toStrictEqual({ release: '2.1.14', sample_rand: '0.123' });

      // Propagation context keeps the meta tag trace data for later events on the same route to add them to the trace
      expect(propagationContext.traceId).toEqual('12312012123120121231201212312012');
      expect(propagationContext.parentSpanId).toEqual('1121201211212012');
      expect(propagationContext.sampleRand).toBe(0.123);
    });

    it('puts frozen Dynamic Sampling Context on pageload span if sentry-trace data and only 3rd party baggage is present', () => {
      // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="foo=bar">';

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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

      // Propagation context keeps the meta tag trace data for later events on the same route to add them to the trace
      expect(propagationContext.traceId).toEqual('12312012123120121231201212312012');
      expect(propagationContext.parentSpanId).toEqual('1121201211212012');
    });

    it('ignores the meta tag data for navigation spans', () => {
      document.head.innerHTML =
        '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
        '<meta name="baggage" content="sentry-release=2.1.14">';

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
        release: undefined,
        org_id: undefined,
        environment: 'production',
        public_key: 'examplePublicKey',
        sample_rate: '1',
        sampled: 'true',
        sample_rand: expect.any(String),
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
        '<meta name="baggage" content="sentry-release=2.1.14,foo=bar,sentry-sample_rand=0.555">';

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
          baggage: 'sentry-release=2.2.14,foo=bar,sentry-sample_rand=0.123',
        },
      );

      const idleSpan = getActiveSpan()!;
      expect(idleSpan).toBeDefined();

      const dynamicSamplingContext = getDynamicSamplingContextFromSpan(idleSpan);
      const propagationContext = getCurrentScope().getPropagationContext();

      // Span is correct
      expect(spanToJSON(idleSpan).op).toBe('pageload');
      expect(spanToJSON(idleSpan).trace_id).toEqual('12312012123120121231201212312011');
      expect(spanToJSON(idleSpan).parent_span_id).toEqual('1121201211212011');
      expect(spanIsSampled(idleSpan)).toBe(true);

      expect(dynamicSamplingContext).toBeDefined();
      expect(dynamicSamplingContext).toStrictEqual({ release: '2.2.14', sample_rand: '0.123' });

      // Propagation context keeps the custom trace data for later events on the same route to add them to the trace
      expect(propagationContext.traceId).toEqual('12312012123120121231201212312011');
      expect(propagationContext.parentSpanId).toEqual('1121201211212011');
      expect(propagationContext.sampleRand).toEqual(0.123);
    });
  });

  describe('idleTimeout', () => {
    it('is created by default', () => {
      vi.useFakeTimers();
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      span.end(); // activities = 0

      // inner1 is now ended, all good
      expect(spans).toHaveLength(1);

      vi.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);

      // idle span itself is now ended
      // there is also the `sentry-tracing-init` span included
      expect(spans).toHaveLength(3);
      expect(spans[2]).toBe(idleSpan);
    });

    it('can be a custom value', () => {
      vi.useFakeTimers();

      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
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
      span.end(); // activities = 0

      // inner1 is now ended, all good
      expect(spans).toHaveLength(1);

      vi.advanceTimersByTime(2000);

      // idle span itself is now ended
      // there is also the `sentry-tracing-init` span included
      expect(spans).toHaveLength(3);
      expect(spans[2]).toBe(idleSpan);
    });
  });

  describe('linkPreviousTrace', () => {
    it('registers the previous trace listener on span start by default', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
          integrations: [browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false })],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span1 = startInactiveSpan({ name: 'test span 1', forceTransaction: true });
      span1.end();
      const span1Json = spanToJSON(span1);

      expect(span1Json.links).toBeUndefined();

      // ensure we start a new trace
      getCurrentScope().setPropagationContext({ traceId: '123', sampleRand: 0.2 });

      const span2 = startInactiveSpan({ name: 'test span 2', forceTransaction: true });
      span2.end();
      const spanJson2 = spanToJSON(span2);

      expect(spanJson2.links).toEqual([
        {
          attributes: {
            'sentry.link.type': 'previous_trace',
          },
          sampled: true,
          span_id: span1Json.span_id,
          trace_id: span1Json.trace_id,
        },
      ]);
    });

    it("doesn't register the previous trace listener on span start if disabled", () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
          integrations: [
            browserTracingIntegration({
              instrumentPageLoad: false,
              instrumentNavigation: false,
              linkPreviousTrace: 'off',
            }),
          ],
        }),
      );
      setCurrentClient(client);
      client.init();

      const span1 = startInactiveSpan({ name: 'test span 1', forceTransaction: true });
      span1.end();
      const span1Json = spanToJSON(span1);

      expect(span1Json.links).toBeUndefined();

      // ensure we start a new trace
      getCurrentScope().setPropagationContext({ traceId: '123', sampleRand: 0.2 });

      const span2 = startInactiveSpan({ name: 'test span 2', forceTransaction: true });
      span2.end();
      const spanJson2 = spanToJSON(span2);

      expect(spanJson2.links).toBeUndefined();
    });
  });

  // TODO(lforst): I cannot manage to get this test to pass.
  /*
  it('heartbeatInterval can be a custom value', () => {
    vi.useFakeTimers();

    const interval = 200;

    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration({ heartbeatInterval: interval })],
      }),
    );

    setCurrentClient(client);
    client.init();

    const mockFinish = vi.fn();
    // eslint-disable-next-line deprecation/deprecation
    const transaction = getActiveTransaction() as IdleTransaction;
    transaction.sendAutoFinishSignal();
    transaction.end = mockFinish;

    const span = startInactiveSpan({ name: 'child-span' }); // activities = 1
    span!.end(); // activities = 0

    expect(mockFinish).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(interval * 3);
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });
  */
});
