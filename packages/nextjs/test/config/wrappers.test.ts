import * as SentryCore from '@sentry/core';
import * as SentryNode from '@sentry/node';
import * as SentryTracing from '@sentry/tracing';
import type { IncomingMessage, ServerResponse } from 'http';

import { wrapGetInitialPropsWithSentry, wrapGetServerSidePropsWithSentry } from '../../src/server';

const startTransactionSpy = jest.spyOn(SentryCore, 'startTransaction');

describe('data-fetching function wrappers', () => {
  const route = '/tricks/[trickName]';
  let req: IncomingMessage;
  let res: ServerResponse;

  describe('starts a transaction and puts request in metadata if tracing enabled', () => {
    beforeEach(() => {
      req = { headers: {}, url: 'http://dogs.are.great/tricks/kangaroo' } as IncomingMessage;
      res = { end: jest.fn() } as unknown as ServerResponse;

      jest.spyOn(SentryTracing, 'hasTracingEnabled').mockReturnValueOnce(true);
      jest.spyOn(SentryNode, 'getCurrentHub').mockReturnValueOnce({
        getClient: () =>
          ({
            getOptions: () => ({ instrumenter: 'sentry' }),
          } as any),
      } as any);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('wrapGetServerSidePropsWithSentry', async () => {
      const origFunction = jest.fn(async () => ({ props: {} }));

      const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);
      await wrappedOriginal({ req, res } as any);

      expect(startTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '/tricks/[trickName]',
          op: 'http.server',
          metadata: expect.objectContaining({ source: 'route', request: req }),
        }),
        {
          request: expect.objectContaining({
            url: 'http://dogs.are.great/tricks/kangaroo',
          }),
        },
      );
    });

    test('wrapGetInitialPropsWithSentry', async () => {
      const origFunction = jest.fn(async () => ({}));

      const wrappedOriginal = wrapGetInitialPropsWithSentry(origFunction);
      await wrappedOriginal({ req, res, pathname: route } as any);

      expect(startTransactionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '/tricks/[trickName]',
          op: 'http.server',
          metadata: expect.objectContaining({ source: 'route', request: req }),
        }),
        {
          request: expect.objectContaining({
            url: 'http://dogs.are.great/tricks/kangaroo',
          }),
        },
      );
    });
  });
});
