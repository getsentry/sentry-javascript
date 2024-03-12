import { WINDOW } from '@sentry/react';
import type { Client, HandlerDataFetch } from '@sentry/types';
import * as sentryUtils from '@sentry/utils';
import { JSDOM } from 'jsdom';

import {
  appRouterInstrumentNavigation,
  appRouterInstrumentPageLoad,
} from '../../src/client/routing/appRouterRoutingInstrumentation';

const addFetchInstrumentationHandlerSpy = jest.spyOn(sentryUtils, 'addFetchInstrumentationHandler');

function setUpPage(url: string) {
  const dom = new JSDOM('<body><h1>nothingness</h1></body>', { url });

  // The Next.js routing instrumentations requires a few things to be present on pageload:
  // 1. Access to window.document API for `window.document.getElementById`
  // 2. Access to window.location API for `window.location.pathname`
  Object.defineProperty(WINDOW, 'document', { value: dom.window.document, writable: true });
  Object.defineProperty(WINDOW, 'location', { value: dom.window.document.location, writable: true });
}

describe('appRouterInstrumentPageLoad', () => {
  const originalGlobalDocument = WINDOW.document;
  const originalGlobalLocation = WINDOW.location;

  afterEach(() => {
    // Clean up JSDom
    Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
    Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
  });

  it('should create a pageload transactions with the current location name', () => {
    setUpPage('https://example.com/some/page?someParam=foobar');

    const emit = jest.fn();
    const client = {
      emit,
    } as unknown as Client;

    appRouterInstrumentPageLoad(client);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'startPageLoadSpan',
      expect.objectContaining({
        name: '/some/page',
        attributes: {
          'sentry.op': 'pageload',
          'sentry.origin': 'auto.pageload.nextjs.app_router_instrumentation',
          'sentry.source': 'url',
        },
      }),
      undefined,
    );
  });
});

describe('appRouterInstrumentNavigation', () => {
  const originalGlobalDocument = WINDOW.document;
  const originalGlobalLocation = WINDOW.location;

  afterEach(() => {
    // Clean up JSDom
    Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
    Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
  });

  it('should create a navigation transactions when a navigation RSC request is sent', () => {
    setUpPage('https://example.com/some/page?someParam=foobar');
    let fetchInstrumentationHandlerCallback: (arg: HandlerDataFetch) => void;

    addFetchInstrumentationHandlerSpy.mockImplementationOnce(callback => {
      fetchInstrumentationHandlerCallback = callback;
    });

    const emit = jest.fn();
    const client = {
      emit,
    } as unknown as Client;

    appRouterInstrumentNavigation(client);

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

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('startNavigationSpan', {
      name: '/some/server/component/page',
      attributes: {
        'sentry.op': 'navigation',
        'sentry.origin': 'auto.navigation.nextjs.app_router_instrumentation',
        'sentry.source': 'url',
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
    'should not create navigation transactions for fetch requests that are not navigating RSC requests (%s)',
    (_, fetchCallbackData) => {
      setUpPage('https://example.com/some/page?someParam=foobar');
      let fetchInstrumentationHandlerCallback: (arg: HandlerDataFetch) => void;

      addFetchInstrumentationHandlerSpy.mockImplementationOnce(callback => {
        fetchInstrumentationHandlerCallback = callback;
      });

      const emit = jest.fn();
      const client = {
        emit,
      } as unknown as Client;

      appRouterInstrumentNavigation(client);
      fetchInstrumentationHandlerCallback!(fetchCallbackData);

      expect(emit).toHaveBeenCalledTimes(0);
    },
  );
});
