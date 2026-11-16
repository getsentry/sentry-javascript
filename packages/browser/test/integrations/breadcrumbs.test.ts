import * as SentryCore from '@sentry/core';
import * as browserUtils from '@sentry/browser-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breadcrumbsIntegration, BrowserClient, flush } from '../../src';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('Breadcrumbs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    SentryCore.getCurrentScope().setClient(undefined);
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

    expect(addBreadcrumbSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'sentry.event',
        message: 'test',
      }),
      expect.anything(),
    );
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
    const expectedBreadcrumbUrl = 'https://app.example.com/users/42?token=[Filtered]';

    it('resolves an empty fetch URL against location.href, drops fragment, and filters query params', () => {
      vi.stubGlobal('location', { href: pageHref });
      const { addBreadcrumbSpy, fetchHandler } = setup();

      fetchHandler({
        fetchData: { method: 'GET', url: '' },
        args: [''],
        startTimestamp: 1,
        endTimestamp: 2,
        response: { status: 200 } as Response,
      });

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ url: expectedBreadcrumbUrl }),
        }),
        expect.anything(),
      );
    });

    it('resolves an empty failed fetch URL against location.href, drops fragment, and filters query params', () => {
      vi.stubGlobal('location', { href: pageHref });
      const { addBreadcrumbSpy, fetchHandler } = setup();

      fetchHandler({
        fetchData: { method: 'GET', url: '' },
        args: [''],
        startTimestamp: 1,
        endTimestamp: 2,
        error: new TypeError('Failed to fetch'),
      });

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ url: expectedBreadcrumbUrl }),
        }),
        expect.anything(),
      );
    });

    it('resolves an empty XHR URL against location.href, drops fragment, and filters query params', () => {
      vi.stubGlobal('location', { href: pageHref });
      const { addBreadcrumbSpy, xhrHandler } = setup();

      xhrHandler({
        xhr: {
          [browserUtils.SENTRY_XHR_DATA_KEY]: { method: 'GET', url: '', status_code: 200, request_headers: {} },
        },
        startTimestamp: 1,
        endTimestamp: 2,
      } as browserUtils.HandlerDataXhr);

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ url: expectedBreadcrumbUrl }),
        }),
        expect.anything(),
      );
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

      expect(addBreadcrumbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ url: '/api/users' }),
        }),
        expect.anything(),
      );
    });
  });
});
