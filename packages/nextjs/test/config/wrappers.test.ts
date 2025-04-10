import type { IncomingMessage, ServerResponse } from 'http';
import * as SentryCore from '@sentry/core';
import type { Client } from '@sentry/core';
import { describe, vi, beforeEach, afterEach, test, expect } from 'vitest';

import { wrapGetInitialPropsWithSentry, wrapGetServerSidePropsWithSentry } from '../../src/common';

const startSpanManualSpy = vi.spyOn(SentryCore, 'startSpanManual');

describe('data-fetching function wrappers should not create manual spans', () => {
  const route = '/tricks/[trickName]';
  let req: IncomingMessage;
  let res: ServerResponse;

  beforeEach(() => {
    req = { headers: {}, url: 'http://dogs.are.great/tricks/kangaroo' } as IncomingMessage;
    res = { end: vi.fn() } as unknown as ServerResponse;

    vi.spyOn(SentryCore, 'hasSpansEnabled').mockReturnValue(true);
    vi.spyOn(SentryCore, 'getClient').mockImplementation(() => {
      return {
        getOptions: () => ({}),
        getDsn: () => {},
      } as Client;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('wrapGetServerSidePropsWithSentry', async () => {
    const origFunction = vi.fn(async () => ({ props: {} }));

    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);
    await wrappedOriginal({ req, res } as any);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  test('wrapGetInitialPropsWithSentry', async () => {
    const origFunction = vi.fn(async () => ({}));

    const wrappedOriginal = wrapGetInitialPropsWithSentry(origFunction);
    await wrappedOriginal({ req, res, pathname: route } as any);

    expect(startSpanManualSpy).not.toHaveBeenCalled();
  });

  test('wrapped function sets route backfill attribute when called within an active span', async () => {
    const mockSetAttribute = vi.fn();
    const mockGetActiveSpan = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);
    const mockGetRootSpan = vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);

    const origFunction = vi.fn(async () => ({ props: {} }));
    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);

    await wrappedOriginal({ req, res } as any);

    expect(mockGetActiveSpan).toHaveBeenCalled();
    expect(mockGetRootSpan).toHaveBeenCalled();
    expect(mockSetAttribute).toHaveBeenCalledWith('sentry.route_backfill', '/tricks/[trickName]');
  });

  test('wrapped function does not set route backfill attribute for /_error route', async () => {
    const mockSetAttribute = vi.fn();
    const mockGetActiveSpan = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);
    const mockGetRootSpan = vi.spyOn(SentryCore, 'getRootSpan').mockReturnValue({
      setAttribute: mockSetAttribute,
    } as any);

    const origFunction = vi.fn(async () => ({ props: {} }));
    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, '/_error');

    await wrappedOriginal({ req, res } as any);

    expect(mockGetActiveSpan).toHaveBeenCalled();
    expect(mockGetRootSpan).not.toHaveBeenCalled();
    expect(mockSetAttribute).not.toHaveBeenCalled();
  });
});
