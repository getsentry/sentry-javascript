import type { Client } from '@sentry/core';
import { WINDOW } from '@sentry/react';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appRouterInstrumentNavigation,
  appRouterInstrumentPageLoad,
} from '../../src/client/routing/appRouterRoutingInstrumentation';
import {
  nextRouterInstrumentNavigation,
  nextRouterInstrumentPageLoad,
} from '../../src/client/routing/nextRoutingInstrumentation';
import { pagesRouterInstrumentNavigation } from '../../src/client/routing/pagesRouterNavigationInstrumentation';
import { pagesRouterInstrumentPageLoad } from '../../src/client/routing/pagesRouterRoutingInstrumentation';

vi.mock('../../src/client/routing/appRouterRoutingInstrumentation', () => ({
  appRouterInstrumentNavigation: vi.fn(),
  appRouterInstrumentPageLoad: vi.fn(),
}));
vi.mock('../../src/client/routing/pagesRouterNavigationInstrumentation', () => ({
  pagesRouterInstrumentNavigation: vi.fn(),
}));
vi.mock('../../src/client/routing/pagesRouterRoutingInstrumentation', () => ({
  pagesRouterInstrumentPageLoad: vi.fn(),
}));

const client = {} as Client;
const originalDocument = WINDOW.document;
const originalHasPagesRouter = process.env._sentryHasPagesRouter;

function setUpPage(router: 'app' | 'pages'): void {
  const dom = new JSDOM(
    router === 'pages'
      ? '<body><script id="__NEXT_DATA__" type="application/json">{"page":"/"}</script></body>'
      : '<body></body>',
  );
  Object.defineProperty(WINDOW, 'document', { value: dom.window.document, writable: true });
}

describe('nextRoutingInstrumentation', () => {
  beforeEach(() => {
    delete process.env._sentryHasPagesRouter;
  });

  afterEach(() => {
    Object.defineProperty(WINDOW, 'document', { value: originalDocument, writable: true });
    if (originalHasPagesRouter === undefined) {
      delete process.env._sentryHasPagesRouter;
    } else {
      process.env._sentryHasPagesRouter = originalHasPagesRouter;
    }
    vi.clearAllMocks();
  });

  it('instruments the App Router when there is no __NEXT_DATA__ tag', () => {
    setUpPage('app');

    nextRouterInstrumentPageLoad(client);
    nextRouterInstrumentNavigation(client);

    expect(appRouterInstrumentPageLoad).toHaveBeenCalledWith(client);
    expect(appRouterInstrumentNavigation).toHaveBeenCalledWith(client);
    expect(pagesRouterInstrumentPageLoad).not.toHaveBeenCalled();
    expect(pagesRouterInstrumentNavigation).not.toHaveBeenCalled();
  });

  it('instruments the Pages Router when there is a __NEXT_DATA__ tag', () => {
    setUpPage('pages');

    nextRouterInstrumentPageLoad(client);
    nextRouterInstrumentNavigation(client);

    expect(pagesRouterInstrumentPageLoad).toHaveBeenCalledWith(client);
    expect(pagesRouterInstrumentNavigation).toHaveBeenCalledWith(client);
    expect(appRouterInstrumentPageLoad).not.toHaveBeenCalled();
    expect(appRouterInstrumentNavigation).not.toHaveBeenCalled();
  });

  describe('when the build declared the project has no Pages Router pages', () => {
    beforeEach(() => {
      process.env._sentryHasPagesRouter = 'false';
    });

    it('skips Pages Router navigation instrumentation, so bundlers can drop it and `next/router`', () => {
      setUpPage('pages');

      nextRouterInstrumentNavigation(client);

      expect(pagesRouterInstrumentNavigation).not.toHaveBeenCalled();
      expect(appRouterInstrumentNavigation).not.toHaveBeenCalled();
    });

    // App Router builds still serve `404.html`/`500.html` through the Pages Router.
    it('still instruments Pages Router pageloads', () => {
      setUpPage('pages');

      nextRouterInstrumentPageLoad(client);

      expect(pagesRouterInstrumentPageLoad).toHaveBeenCalledWith(client);
    });
  });
});
