/**
 * @vitest-environment jsdom
 */

import * as SentryBrowser from '@sentry/browser';
import { PAGE_SERVER_RENDERING_TYPE, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { _INTERNAL_CACHE_ORIGIN_META_TAG_NAME } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserTracingIntegration } from '../../src/client/browserTracingIntegration';

const fakeClient = { getOptions: () => ({}), on: () => {}, addEventProcessor: () => {} };

function addCacheOriginMetaTag(content: string): void {
  const meta = document.createElement('meta');
  meta.name = _INTERNAL_CACHE_ORIGIN_META_TAG_NAME;
  meta.content = content;
  document.head.appendChild(meta);
}

describe('browserTracingIntegration', () => {
  const startBrowserTracingPageLoadSpanSpy = vi
    .spyOn(SentryBrowser, 'startBrowserTracingPageLoadSpan')
    .mockImplementation(() => ({}) as Span);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('marks the pageload of a prerendered page as static', () => {
    addCacheOriginMetaTag('');

    // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
    browserTracingIntegration().afterAllSetup(fakeClient);

    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({
        attributes: expect.objectContaining({
          [SENTRY_ORIGIN]: 'auto.pageload.astro',
          [PAGE_SERVER_RENDERING_TYPE]: 'static',
        }),
      }),
    );
  });

  it('does not mark the pageload of a page rendered for this request', () => {
    // @ts-expect-error - the fakeClient doesn't satisfy Client but that's fine
    browserTracingIntegration().afterAllSetup(fakeClient);

    expect(startBrowserTracingPageLoadSpanSpy).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({
        attributes: expect.not.objectContaining({ [PAGE_SERVER_RENDERING_TYPE]: expect.anything() }),
      }),
    );
  });
});
