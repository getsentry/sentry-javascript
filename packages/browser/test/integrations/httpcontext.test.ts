import { describe, expect, it, vi } from 'vitest';
import { httpContextIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP } from '../../src/exports';
import type { StreamedSpanJSON } from '@sentry/core';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';
import { BrowserClient } from '../../src/client';

describe('httpContextIntegration', () => {
  globalThis.navigator = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  } as unknown as Navigator;
  globalThis.location = {
    href: 'https://example.com',
  } as unknown as Location;
  globalThis.document = {
    referrer: 'https://example.com',
    addEventListener: vi.fn(),
    location: {
      href: 'https://example.com',
    },
  } as unknown as Document;

  it("doesn't attach url.full to http.client segment spans", () => {
    const integration = httpContextIntegration();

    const span: Partial<StreamedSpanJSON> = {
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
      },
    };

    const browserClient = new BrowserClient(getDefaultBrowserClientOptions());

    integration.processSegmentSpan!(span as StreamedSpanJSON, browserClient);

    expect(span.attributes).not.toHaveProperty('url.full');
    expect(span.attributes).toEqual({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
      'http.request.header.referer': 'https://example.com',
      'http.request.header.user_agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    });
  });

  it('attaches url.full to non-http.client segment spans', () => {
    const integration = httpContextIntegration();

    const span: Partial<StreamedSpanJSON> = {
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      },
    };

    const browserClient = new BrowserClient(getDefaultBrowserClientOptions());

    integration.processSegmentSpan!(span as StreamedSpanJSON, browserClient);

    expect(span.attributes).toEqual({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      'http.request.header.referer': 'https://example.com',
      'http.request.header.user_agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'url.full': 'https://example.com',
    });
  });
});
