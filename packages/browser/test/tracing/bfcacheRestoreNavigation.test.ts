/**
 * @vitest-environment jsdom
 */

import {
  browserPerformanceTimeOrigin,
  getActiveSpan,
  getMainCarrier,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';
import { JSDOM } from 'jsdom';
import { TextDecoder, TextEncoder } from 'util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/client';
import { WINDOW } from '../../src/helpers';
import { browserTracingIntegration } from '../../src/tracing/browserTracingIntegration';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

// @ts-expect-error patch the encoder on the window, else importing JSDOM fails
delete global.window.TextEncoder;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails
delete global.window.TextDecoder;
global.window.TextEncoder = TextEncoder;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails
global.window.TextDecoder = TextDecoder;

const dom = new JSDOM(undefined, { url: 'https://example.com/' });
Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });
Object.defineProperty(global, 'history', { value: dom.window.history, writable: true });

// This lives in its own file on purpose. The history instrumentation tracks the previous URL in
// module state, so `from` is only `undefined` on the very first history event of the module's life.
// Any earlier `pushState` in the same file sets it and makes the case under test unreachable.
describe('bfcache restore, then the first history navigation of the document', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(browserPerformanceTimeOrigin()!);
    getMainCarrier().__SENTRY__ = undefined;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    getActiveSpan()?.end();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // A page that never touched the History API before it was frozen hits the pageload guard on its
  // first navigation after the restore. Clearing `startingUrl` has to actually disable that guard,
  // otherwise the guard swallows the navigation and that route stays on the restore span.
  it('starts a navigation span rather than leaving the route on the restore span', () => {
    const client = new BrowserClient(
      getDefaultBrowserClientOptions({
        tracesSampleRate: 1,
        integrations: [browserTracingIntegration({ instrumentPageLoad: false })],
      }),
    );
    setCurrentClient(client);
    client.init();

    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    WINDOW.dispatchEvent(event);

    expect(spanToJSON(getActiveSpan()!).attributes).toEqual(
      expect.objectContaining({ [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser.bfcache' }),
    );

    // Past the redirect threshold, so the navigation is judged on the pageload guard alone rather
    // than being folded into the restore span as a redirect.
    vi.advanceTimersByTime(2000);
    WINDOW.history.pushState({}, '', '/after-restore');

    expect(spanToJSON(getActiveSpan()!).attributes).toEqual(
      expect.objectContaining({ [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.browser' }),
    );
  });
});
