import type { IncomingMessage, ServerResponse } from 'http';
import * as SentryCore from '@sentry/core';

import type { Client } from '@sentry/types';
import { wrapGetInitialPropsWithSentry, wrapGetServerSidePropsWithSentry } from '../../src/common';

const startSpanManualSpy = jest.spyOn(SentryCore, 'startSpanManual');

describe('data-fetching function wrappers should not create manual spans', () => {
  const route = '/tricks/[trickName]';
  let req: IncomingMessage;
  let res: ServerResponse;

  beforeEach(() => {
    req = { headers: {}, url: 'http://dogs.are.great/tricks/kangaroo' } as IncomingMessage;
    res = { end: jest.fn() } as unknown as ServerResponse;

    jest.spyOn(SentryCore, 'hasTracingEnabled').mockReturnValue(true);
    jest.spyOn(SentryCore, 'getClient').mockImplementation(() => {
      return {
        getOptions: () => ({}),
        getDsn: () => {},
      } as Client;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('wrapGetServerSidePropsWithSentry', async () => {
    const origFunction = jest.fn(async () => ({ props: {} }));

    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);
    await wrappedOriginal({ req, res } as any);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  test('wrapGetInitialPropsWithSentry', async () => {
    const origFunction = jest.fn(async () => ({}));

    const wrappedOriginal = wrapGetInitialPropsWithSentry(origFunction);
    await wrappedOriginal({ req, res, pathname: route } as any);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  test('wrapped function sets route backfill attribute when called within an active span', async () => {
    const mockSetAttribute = jest.fn();
    const mockGetActiveSpan = jest.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);
    const mockGetRootSpan = jest.spyOn(SentryCore, 'getRootSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);

    const origFunction = jest.fn(async () => ({ props: {} }));
    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);

    await wrappedOriginal({ req, res } as any);

    expect(mockGetActiveSpan).toHaveBeenCalled();
    expect(mockGetRootSpan).toHaveBeenCalled();
    expect(mockSetAttribute).toHaveBeenCalledWith('sentry.route_backfill', '/tricks/[trickName]');
  });

  test('wrapped function does not set route backfill attribute for /_error route', async () => {
    const mockSetAttribute = jest.fn();
    const mockGetActiveSpan = jest.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);
    const mockGetRootSpan = jest.spyOn(SentryCore, 'getRootSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);

    const origFunction = jest.fn(async () => ({ props: {} }));
    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, '/_error');

    await wrappedOriginal({ req, res } as any);

    expect(mockGetActiveSpan).toHaveBeenCalled();
    expect(mockGetRootSpan).not.toHaveBeenCalled();
    expect(mockSetAttribute).not.toHaveBeenCalled();
  });
});
