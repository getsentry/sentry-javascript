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

  describe('dataCollection', () => {
    it('attaches headers to events by default', () => {
      const client = new BrowserClient(getDefaultBrowserClientOptions());
      const event: Event = {};

      httpContextIntegration().preprocessEvent!(event, {}, client);

      expect(event.request).toEqual({
        url: 'https://example.com',
        headers: { Referer: 'https://example.com', 'User-Agent': USER_AGENT },
      });
    });

    it('does not attach headers to events when `httpHeaders.request` is disabled', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({ dataCollection: { httpHeaders: { request: false } } }),
      );
      const event: Event = {};

      httpContextIntegration().preprocessEvent!(event, {}, client);

      expect(event.request).toEqual({ url: 'https://example.com' });
    });

    it('drops headers already on the event, which `browserTracingIntegration` attaches unfiltered', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({ dataCollection: { httpHeaders: { request: false } } }),
      );
      const event: Event = {
        type: 'transaction',
        request: { url: 'https://example.com', headers: { Referer: 'https://example.com', 'User-Agent': USER_AGENT } },
      };

      httpContextIntegration().preprocessEvent!(event, {}, client);

      expect(event.request).toEqual({ url: 'https://example.com' });
    });

    it('leaves user-supplied headers untouched, since `dataCollection` only governs instrumented data', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({ dataCollection: { httpHeaders: { request: false } } }),
      );
      const event: Event = {
        request: { headers: { Referer: 'https://example.com', 'X-My-Own-Header': 'user-set-this' } },
      };

      httpContextIntegration().preprocessEvent!(event, {}, client);

      expect(event.request).toEqual({
        url: 'https://example.com',
        headers: { 'X-My-Own-Header': 'user-set-this' },
      });
    });

    it('applies an allowlist to event headers', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({ dataCollection: { httpHeaders: { request: { allow: ['user-agent'] } } } }),
      );
      const event: Event = {};

      httpContextIntegration().preprocessEvent!(event, {}, client);

      expect(event.request).toEqual({
        url: 'https://example.com',
        headers: { Referer: '[Filtered]', 'User-Agent': USER_AGENT },
      });
    });

    it('does not attach header attributes to segment spans when `httpHeaders.request` is disabled', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({ dataCollection: { httpHeaders: { request: false } } }),
      );
      const span: Partial<StreamedSpanJSON> = {
        attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload' },
      };

      httpContextIntegration().processSegmentSpan!(span as StreamedSpanJSON, client);

      expect(span.attributes).toEqual({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        'url.full': 'https://example.com',
      });
    });

    it('applies a denylist to segment span header attributes', () => {
      const client = new BrowserClient(
        getDefaultBrowserClientOptions({ dataCollection: { httpHeaders: { request: { deny: ['referer'] } } } }),
      );
      const span: Partial<StreamedSpanJSON> = {
        attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload' },
      };

      httpContextIntegration().processSegmentSpan!(span as StreamedSpanJSON, client);

      expect(span.attributes).toEqual({
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
        'url.full': 'https://example.com',
        'http.request.header.referer': '[Filtered]',
        'http.request.header.user_agent': USER_AGENT,
      });
    });
  });
});
