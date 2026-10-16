import { describe, expect, it, vi } from 'vitest';
import { httpContextIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP } from '../../src/exports';
import type { Event, StreamedSpanJSON } from '@sentry/core';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';
import { BrowserClient } from '../../src/client';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

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
      is_segment: true,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
      },
    };

    const browserClient = new BrowserClient(getDefaultBrowserClientOptions());

    integration.processSpan!(span as StreamedSpanJSON, browserClient);

    expect(span.attributes).not.toHaveProperty('url.full');
    expect(span.attributes).toEqual({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.client',
      'http.request.header.referer': 'https://example.com',
      'user_agent.original': USER_AGENT,
    });
  });

  it('attaches url.full to non-http.client segment spans', () => {
    const integration = httpContextIntegration();

    const span: Partial<StreamedSpanJSON> = {
      is_segment: true,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      },
    };

    const browserClient = new BrowserClient(getDefaultBrowserClientOptions());

    integration.processSpan!(span as StreamedSpanJSON, browserClient);

    expect(span.attributes).toEqual({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
      'http.request.header.referer': 'https://example.com',
      'user_agent.original': USER_AGENT,
      'url.full': 'https://example.com',
    });
  });

  it('only attaches the user agent to non-segment spans', () => {
    const integration = httpContextIntegration();

    const span: Partial<StreamedSpanJSON> = {
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.click',
      },
    };

    integration.processSpan!(span as StreamedSpanJSON, new BrowserClient(getDefaultBrowserClientOptions()));

    expect(span.attributes).toEqual({
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.click',
      'user_agent.original': USER_AGENT,
    });
  });

  it('filters sensitive query params in the URL attached to events', () => {
    const client = new BrowserClient(getDefaultBrowserClientOptions());
    const event: Event = {};

    document.location.href = 'https://example.com/?jwt=baz&page=1';
    try {
      httpContextIntegration().preprocessEvent!(event, {}, client);
    } finally {
      document.location.href = 'https://example.com';
    }

    expect(event.request?.url).toBe('https://example.com/?jwt=[Filtered]&page=1');
  });

  it('leaves a user-supplied event URL untouched', () => {
    const client = new BrowserClient(getDefaultBrowserClientOptions());
    const event: Event = { request: { url: 'https://example.com/?jwt=user-set' } };

    httpContextIntegration().preprocessEvent!(event, {}, client);

    expect(event.request?.url).toBe('https://example.com/?jwt=user-set');
  });
});
