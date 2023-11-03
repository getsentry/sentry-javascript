import { WINDOW } from '@sentry/react';
import type { HandlerDataFetch } from '@sentry/types';
import * as sentryUtils from '@sentry/utils';
import { JSDOM } from 'jsdom';

import { appRouterInstrumentation } from '../../src/client/routing/appRouterRoutingInstrumentation';

const addInstrumentationHandlerSpy = jest.spyOn(sentryUtils, 'addInstrumentationHandler');

function setUpPage(url: string) {
  const dom = new JSDOM('<body><h1>nothingness</h1></body>', { url });

  // The Next.js routing instrumentations requires a few things to be present on pageload:
  // 1. Access to window.document API for `window.document.getElementById`
  // 2. Access to window.location API for `window.location.pathname`
  Object.defineProperty(WINDOW, 'document', { value: dom.window.document, writable: true });
  Object.defineProperty(WINDOW, 'location', { value: dom.window.document.location, writable: true });
}

describe('appRouterInstrumentation', () => {
  const originalGlobalDocument = WINDOW.document;
  const originalGlobalLocation = WINDOW.location;

  afterEach(() => {
    // Clean up JSDom
    Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
    Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
  });

  it('should create a pageload transactions with the current location name', () => {
    setUpPage('https://example.com/some/page?someParam=foobar');
    const startTransactionCallbackFn = jest.fn();
    appRouterInstrumentation(startTransactionCallbackFn, true, false);
    expect(startTransactionCallbackFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '/some/page',
        op: 'pageload',
        tags: {
          'routing.instrumentation': 'next-app-router',
        },
        metadata: { source: 'url' },
      }),
    );
  });

  it('should not create a pageload transaction when `startTransactionOnPageLoad` is false', () => {
    setUpPage('https://example.com/some/page?someParam=foobar');
    const startTransactionCallbackFn = jest.fn();
    appRouterInstrumentation(startTransactionCallbackFn, false, false);
    expect(startTransactionCallbackFn).not.toHaveBeenCalled();
  });

  it('should create a navigation transactions when a navigation RSC request is sent', () => {
    setUpPage('https://example.com/some/page?someParam=foobar');
    let fetchInstrumentationHandlerCallback: (arg: HandlerDataFetch) => void;

    addInstrumentationHandlerSpy.mockImplementationOnce((_type, callback) => {
      fetchInstrumentationHandlerCallback = callback;
    });

    const startTransactionCallbackFn = jest.fn();
    appRouterInstrumentation(startTransactionCallbackFn, false, true);

    fetchInstrumentationHandlerCallback!({
      args: [
        new URL('https://example.com/some/server/component/page?_rsc=2rs8t'),
        {
          headers: {
            RSC: '1',
          },
        },
      ],
      fetchData: { method: 'GET', url: 'https://example.com/some/server/component/page?_rsc=2rs8t' },
      startTimestamp: 1337,
    });

    expect(startTransactionCallbackFn).toHaveBeenCalledWith({
      name: '/some/server/component/page',
      op: 'navigation',
      metadata: { source: 'url' },
      tags: {
        from: '/some/page',
        'routing.instrumentation': 'next-app-router',
      },
    });
  });

  it.each([
    [
      'no RSC header',
      {
        args: [
          new URL('https://example.com/some/server/component/page?_rsc=2rs8t'),
          {
            headers: {},
          },
        ],
        fetchData: { method: 'GET', url: 'https://example.com/some/server/component/page?_rsc=2rs8t' },
        startTimestamp: 1337,
      },
    ],
    [
      'no GET request',
      {
        args: [
          new URL('https://example.com/some/server/component/page?_rsc=2rs8t'),
          {
            headers: {
              RSC: '1',
            },
          },
        ],
        fetchData: { method: 'POST', url: 'https://example.com/some/server/component/page?_rsc=2rs8t' },
        startTimestamp: 1337,
      },
    ],
    [
      'prefetch request',
      {
        args: [
          new URL('https://example.com/some/server/component/page?_rsc=2rs8t'),
          {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
            },
          },
        ],
        fetchData: { method: 'GET', url: 'https://example.com/some/server/component/page?_rsc=2rs8t' },
        startTimestamp: 1337,
      },
    ],
  ])(
    'should not create naviagtion transactions for fetch requests that are not navigating RSC requests (%s)',
    (_, fetchCallbackData) => {
      setUpPage('https://example.com/some/page?someParam=foobar');
      let fetchInstrumentationHandlerCallback: (arg: HandlerDataFetch) => void;

      addInstrumentationHandlerSpy.mockImplementationOnce((_type, callback) => {
        fetchInstrumentationHandlerCallback = callback;
      });

      const startTransactionCallbackFn = jest.fn();
      appRouterInstrumentation(startTransactionCallbackFn, false, true);
      fetchInstrumentationHandlerCallback!(fetchCallbackData);
      expect(startTransactionCallbackFn).not.toHaveBeenCalled();
    },
  );

  it('should not create navigation transactions when `startTransactionOnLocationChange` is false', () => {
    setUpPage('https://example.com/some/page?someParam=foobar');
    const addInstrumentationHandlerImpl = jest.fn();
    const startTransactionCallbackFn = jest.fn();

    addInstrumentationHandlerSpy.mockImplementationOnce(addInstrumentationHandlerImpl);
    appRouterInstrumentation(startTransactionCallbackFn, false, false);
    expect(addInstrumentationHandlerImpl).not.toHaveBeenCalled();
  });
});
