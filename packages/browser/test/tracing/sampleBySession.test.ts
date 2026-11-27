/**
 * @vitest-environment jsdom
 */
import type { Span } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getMainCarrier,
  resolveSamplingUnit,
  sampleRandFromKey,
  setCurrentClient,
  spanIsSampled,
  spanToJSON,
  startSession,
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
import { shouldProfileSession } from '../../src/profiling/utils';
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

const originalGlobalDocument = WINDOW.document;
const originalGlobalLocation = WINDOW.location;
const originalGlobalHistory = WINDOW.history;

function setup(
  options: Parameters<typeof getDefaultBrowserClientOptions>[0],
  browserTracingOptions: Parameters<typeof browserTracingIntegration>[0] = {},
): BrowserClient {
  const client = new BrowserClient(
    getDefaultBrowserClientOptions({
      integrations: [
        browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false, ...browserTracingOptions }),
      ],
      ...options,
    }),
  );
  setCurrentClient(client);
  client.init();
  return client;
}

function sampleRandOf(span: Span | undefined): string | undefined {
  return span && getDynamicSamplingContextFromSpan(span).sample_rand;
}

// What the server rendered into the document: it sampled its trace with a value the session did not choose
const SERVER_TRACE_ID = '12312012123120121231201212312012';
const SERVER_SPAN_ID = '1121201211212012';
const serverTrace = (sampleRand: number, sampled: boolean) => ({
  sentryTrace: `${SERVER_TRACE_ID}-${SERVER_SPAN_ID}-${sampled ? 1 : 0}`,
  baggage: `sentry-sample_rand=${sampleRand},sentry-sample_rate=0.5,sentry-sampled=${sampled}`,
});

describe('sessionSampleRate with browserTracingIntegration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getMainCarrier().__SENTRY__ = undefined;
    const dom = new JSDOM(undefined, { url: 'https://example.com/' });
    Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
    Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });
    Object.defineProperty(global, 'history', { value: dom.window.history, writable: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    getActiveSpan()?.end();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    global.window.TextEncoder = oldTextEncoder;
    global.window.TextDecoder = oldTextDecoder;
    Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
    Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
    Object.defineProperty(WINDOW, 'history', { value: originalGlobalHistory });
  });

  it('makes one decision for the pageload and all navigations of a session (client-rendered app)', () => {
    for (let s = 0; s < 30; s++) {
      getMainCarrier().__SENTRY__ = undefined;
      // No `tracesSampleRate`: the session rate is the only sampling option
      const client = setup({ sessionSampleRate: 0.5 });
      const session = startSession();
      const expectedRand = sampleRandFromKey(session.sid);

      const spans: Span[] = [startBrowserTracingPageLoadSpan(client, { name: '/' })!];
      for (const name of ['/products', '/cart', '/checkout']) {
        const span = startBrowserTracingNavigationSpan(client, { name })!;
        spans.push(span);
        // The scope carries the same value as the span, for outgoing requests without an active span
        expect(`${getCurrentScope().getPropagationContext().sampleRand}`).toBe(sampleRandOf(span));
      }

      for (const span of spans) {
        expect(spanIsSampled(span)).toBe(expectedRand < 0.5);
        if (expectedRand < 0.5) {
          // All traces of a sampled session carry the session's value
          expect(sampleRandOf(span)).toBe(`${expectedRand}`);
        } else {
          expect(Number(sampleRandOf(span))).toBeGreaterThanOrEqual(0.5);
        }
      }

      // Each navigation is still its own trace
      expect(new Set(spans.map(span => span.spanContext().traceId)).size).toBe(4);
    }
  });

  it('falls back to `tracesSampleRate` for the navigations of an unsampled session', () => {
    const client = setup({ sessionSampleRate: 0.2, tracesSampleRate: 1 });
    let session = startSession();
    while (sampleRandFromKey(session.sid) < 0.2) {
      session = startSession();
    }

    for (const name of ['/products', '/cart']) {
      const span = startBrowserTracingNavigationSpan(client, { name })!;
      expect(spanIsSampled(span)).toBe(true);
      expect(getDynamicSamplingContextFromSpan(span).sample_rate).toBe('1');
    }
    expect(resolveSamplingUnit(client.getOptions())?.sampled).toBe(false);
  });

  describe('server-rendered pageload', () => {
    it('starts its own trace and links the server request by default, so the session decides', () => {
      for (let s = 0; s < 30; s++) {
        getMainCarrier().__SENTRY__ = undefined;
        const client = setup({ sessionSampleRate: 0.5 });
        const session = startSession();
        const sessionSampled = sampleRandFromKey(session.sid) < 0.5;

        // The server decided the opposite of the session
        const pageload = startBrowserTracingPageLoadSpan(client, { name: '/' }, serverTrace(0.42, !sessionSampled))!;

        expect(pageload.spanContext().traceId).not.toBe(SERVER_TRACE_ID);
        expect(spanIsSampled(pageload)).toBe(sessionSampled);
        if (sessionSampled) {
          expect(sampleRandOf(pageload)).toBe(`${sampleRandFromKey(session.sid)}`);
        }

        // The link is kept on unsampled spans too, but only sampled spans are sent
        if (sessionSampled) {
          expect(spanToJSON(pageload).links).toEqual([
            {
              trace_id: SERVER_TRACE_ID,
              span_id: SERVER_SPAN_ID,
              sampled: !sessionSampled,
              attributes: { 'sentry.link.type': 'server_request' },
            },
          ]);
        }

        // The session keeps its own value, and navigations follow it
        expect(resolveSamplingUnit(client.getOptions())?.sampled).toBe(sessionSampled);
        expect(spanIsSampled(startBrowserTracingNavigationSpan(client, { name: '/products' })!)).toBe(sessionSampled);
      }
    });

    it("continues the server's trace with `serverTrace: 'continue'`, and the session adopts its value", () => {
      const client = setup({ sessionSampleRate: 0.1 }, { serverTrace: 'continue' });
      startSession();

      const pageload = startBrowserTracingPageLoadSpan(client, { name: '/' }, serverTrace(0.3, true))!;

      // One distributed trace, with the server's decision
      expect(pageload.spanContext().traceId).toBe(SERVER_TRACE_ID);
      expect(spanIsSampled(pageload)).toBe(true);
      expect(spanToJSON(pageload).links).toBeUndefined();

      // The session adopted 0.3. With a session rate of 0.1 it is unsampled, so the pageload trace is the
      // one part of this session that was sent anyway.
      expect(resolveSamplingUnit(client.getOptions())).toMatchObject({ sampleRand: 0.3, sampled: false });
      expect(spanIsSampled(startBrowserTracingNavigationSpan(client, { name: '/products' })!)).toBe(false);
    });

    it("continues the server's trace by default if the SDK does not sample by session", () => {
      const client = setup({ tracesSampleRate: 0 });
      startSession();

      const pageload = startBrowserTracingPageLoadSpan(client, { name: '/' }, serverTrace(0.3, true))!;

      expect(pageload.spanContext().traceId).toBe(SERVER_TRACE_ID);
      expect(spanIsSampled(pageload)).toBe(true);
    });
  });

  it('runs the profiler in exactly the sampled sessions', () => {
    for (let s = 0; s < 30; s++) {
      getMainCarrier().__SENTRY__ = undefined;
      const client = setup({ sessionSampleRate: 0.5, profileLifecycle: 'trace' });
      const session = startSession();

      expect(shouldProfileSession(client.getOptions())).toBe(sampleRandFromKey(session.sid) < 0.5);
    }
  });
});
