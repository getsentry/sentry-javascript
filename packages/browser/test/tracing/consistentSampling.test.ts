/**
 * @vitest-environment jsdom
 */
import type { Span } from '@sentry/core';
import {
  getActiveSpan,
  getCurrentScope,
  getDynamicSamplingContextFromSpan,
  getMainCarrier,
  sampleRandFromKey,
  setCurrentClient,
  spanIsSampled,
  startSession,
} from '@sentry/core';
import { JSDOM } from 'jsdom';
import { TextDecoder, TextEncoder } from 'util';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/client';
import { WINDOW } from '../../src/helpers';
import { shouldProfileSession } from '../../src/profiling/utils';
import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '../../src/tracing/browserTracingIntegration';
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

function setup(options: Parameters<typeof getDefaultBrowserClientOptions>[0]): BrowserClient {
  const client = new BrowserClient(
    getDefaultBrowserClientOptions({
      consistentSampling: 'session',
      integrations: [browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false })],
      ...options,
    }),
  );
  setCurrentClient(client);
  client.init();
  return client;
}

// What the server rendered into the document: it sampled its trace with a rate of 0.5
const SERVER_TRACE_ID = '12312012123120121231201212312012';
const serverTrace = (sampleRand: number, sampled: boolean) => ({
  sentryTrace: `${SERVER_TRACE_ID}-1121201211212012-${sampled ? 1 : 0}`,
  baggage: `sentry-sample_rand=${sampleRand},sentry-sample_rate=0.5,sentry-sampled=${sampled}`,
});

describe("consistentSampling: 'session' with browserTracingIntegration", () => {
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
    const decisions = new Set<boolean>();

    for (let s = 0; s < 30; s++) {
      getMainCarrier().__SENTRY__ = undefined;
      const client = setup({ tracesSampleRate: 0.5 });
      const session = startSession();
      const expectedRand = sampleRandFromKey(session.sid);

      const spans: Span[] = [startBrowserTracingPageLoadSpan(client, { name: '/' })!];
      for (const name of ['/products', '/cart', '/checkout']) {
        spans.push(startBrowserTracingNavigationSpan(client, { name })!);
        // The scope carries the session's value too, for outgoing requests without an active span
        expect(getCurrentScope().getPropagationContext().sampleRand).toBe(expectedRand);
      }

      for (const span of spans) {
        const dsc = getDynamicSamplingContextFromSpan(span);
        expect(spanIsSampled(span)).toBe(expectedRand < 0.5);
        expect(dsc.sample_rand).toBe(`${expectedRand}`);
        expect(dsc.sample_rate).toBe('0.5');
      }

      // Each navigation is still its own trace
      expect(new Set(spans.map(span => span.spanContext().traceId)).size).toBe(4);
      decisions.add(expectedRand < 0.5);
    }

    expect(decisions).toEqual(new Set([true, false]));
  });

  describe('server-rendered pageload', () => {
    it("continues the server's trace and keeps its positive decision for the session", () => {
      // The browser alone would sample nothing
      const client = setup({ tracesSampleRate: 0 });
      startSession();

      const pageload = startBrowserTracingPageLoadSpan(client, { name: '/' }, serverTrace(0.3, true))!;
      expect(pageload.spanContext().traceId).toBe(SERVER_TRACE_ID);
      expect(spanIsSampled(pageload)).toBe(true);

      for (const name of ['/products', '/cart']) {
        const navigation = startBrowserTracingNavigationSpan(client, { name })!;
        const dsc = getDynamicSamplingContextFromSpan(navigation);

        expect(navigation.spanContext().traceId).not.toBe(SERVER_TRACE_ID);
        expect(spanIsSampled(navigation)).toBe(true);
        // The navigation reports the server's value and rate, because that is how the decision was made
        expect(dsc.sample_rand).toBe('0.3');
        expect(dsc.sample_rate).toBe('0.5');
      }
    });

    it("keeps the server's negative decision for the session", () => {
      // The browser alone would sample everything
      const client = setup({ tracesSampleRate: 1 });
      startSession();

      const pageload = startBrowserTracingPageLoadSpan(client, { name: '/' }, serverTrace(0.7, false))!;
      expect(spanIsSampled(pageload)).toBe(false);

      for (const name of ['/products', '/cart']) {
        expect(spanIsSampled(startBrowserTracingNavigationSpan(client, { name })!)).toBe(false);
      }
    });
  });

  it('runs the profiler only in sessions whose traces are sampled, if its rate is not above the trace rate', () => {
    let profiled = 0;

    for (let s = 0; s < 60; s++) {
      getMainCarrier().__SENTRY__ = undefined;
      const client = setup({ tracesSampleRate: 0.5, profileSessionSampleRate: 0.25, profileLifecycle: 'trace' });
      const session = startSession();

      const shouldProfile = shouldProfileSession(client.getOptions());
      const pageload = startBrowserTracingPageLoadSpan(client, { name: '/' })!;

      expect(shouldProfile).toBe(sampleRandFromKey(session.sid) < 0.25);
      if (shouldProfile) {
        expect(spanIsSampled(pageload)).toBe(true);
        profiled++;
      }
    }

    expect(profiled).toBeGreaterThan(0);
    expect(profiled).toBeLessThan(60);
  });
});
