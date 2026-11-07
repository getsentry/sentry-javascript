import * as SentryCore from '@sentry/core';
import * as browserUtils from '@sentry/browser-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breadcrumbsIntegration, BrowserClient, flush } from '../../src';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('Breadcrumbs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('Should add sentry breadcrumb', async () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [breadcrumbsIntegration()],
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const addBreadcrumbSpy = vi.spyOn(SentryCore, 'addBreadcrumb').mockImplementation(() => {});

    client.captureMessage('test');
    await flush(2000);

    expect(addBreadcrumbSpy.mock.calls[0]?.[0]?.category).toEqual('sentry.event');
    expect(addBreadcrumbSpy.mock.calls[0]?.[0]?.message).toEqual('test');
  });

  describe('empty request URLs', () => {
    function setup() {
      let fetchHandler: ((data: SentryCore.HandlerDataFetch) => void) | undefined;
      let xhrHandler: ((data: browserUtils.HandlerDataXhr) => void) | undefined;

      vi.spyOn(SentryCore, 'addFetchInstrumentationHandler').mockImplementation(handler => {
        fetchHandler = handler;
      });
      vi.spyOn(browserUtils, 'addXhrInstrumentationHandler').mockImplementation(handler => {
        xhrHandler = handler;
      });
      const addBreadcrumbSpy = vi.spyOn(SentryCore, 'addBreadcrumb').mockImplementation(() => {});

      const client = new BrowserClient({
        ...getDefaultBrowserClientOptions(),
        dsn: 'https://username@domain/123',
        integrations: [breadcrumbsIntegration()],
      });
      SentryCore.setCurrentClient(client);
      client.init();

      return { addBreadcrumbSpy, fetchHandler: fetchHandler!, xhrHandler: xhrHandler! };
    }

    const pageHref = 'https://app.example.com/users/42?token=secret#section';
    const pagePath = 'https://app.example.com/users/42';

    it('shows the page URL without query or fragment in a fetch breadcrumb', () => {
      vi.stubGlobal('location', { href: pageHref });
      const { addBreadcrumbSpy, fetchHandler } = setup();

      fetchHandler({
        fetchData: { method: 'GET', url: '' },
        args: [''],
        startTimestamp: 1,
        endTimestamp: 2,
        response: { status: 200 } as Response,
      });

      expect(addBreadcrumbSpy.mock.calls[0]?.[0]?.data?.url).toBe(pagePath);
    });

    it('shows the page URL without query or fragment in a failed fetch breadcrumb', () => {
      vi.stubGlobal('location', { href: pageHref });
      const { addBreadcrumbSpy, fetchHandler } = setup();

      fetchHandler({
        fetchData: { method: 'GET', url: '' },
        args: [''],
        startTimestamp: 1,
        endTimestamp: 2,
        error: new TypeError('Failed to fetch'),
      });

      expect(addBreadcrumbSpy.mock.calls[0]?.[0]?.data?.url).toBe(pagePath);
    });

    it('shows the page URL without query or fragment in an XHR breadcrumb', () => {
      vi.stubGlobal('location', { href: pageHref });
      const { addBreadcrumbSpy, xhrHandler } = setup();

      xhrHandler({
        xhr: {
          [browserUtils.SENTRY_XHR_DATA_KEY]: { method: 'GET', url: '', status_code: 200, request_headers: {} },
        },
        startTimestamp: 1,
        endTimestamp: 2,
      } as browserUtils.HandlerDataXhr);

      expect(addBreadcrumbSpy.mock.calls[0]?.[0]?.data?.url).toBe(pagePath);
    });

    it('leaves non-empty URLs unchanged', () => {
      vi.stubGlobal('location', { href: pageHref });
      const { addBreadcrumbSpy, fetchHandler } = setup();

      fetchHandler({
        fetchData: { method: 'GET', url: '/api/users' },
        args: ['/api/users'],
        startTimestamp: 1,
        endTimestamp: 2,
        response: { status: 200 } as Response,
      });

      expect(addBreadcrumbSpy.mock.calls[0]?.[0]?.data?.url).toBe('/api/users');
    });
  });
});
