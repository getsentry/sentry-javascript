import * as SentryCore from '@sentry/core';
import { addTracingExtensions } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import type { IncomingMessage, ServerResponse } from 'http';

import { wrapGetInitialPropsWithSentry, wrapGetServerSidePropsWithSentry } from '../../src/server';

const startTransactionSpy = jest.spyOn(SentryCore, 'startTransaction');

// The wrap* functions require the hub to have tracing extensions. This is normally called by the NodeClient
// constructor but the client isn't used in these tests.
addTracingExtensions();

describe('data-fetching function wrappers', () => {
  const route = '/tricks/[trickName]';
  let req: IncomingMessage;
  let res: ServerResponse;

  describe('starts a transaction and puts request in metadata if tracing enabled', () => {
    beforeEach(() => {
      req = { headers: {}, url: 'http://dogs.are.great/tricks/kangaroo' } as IncomingMessage;
      res = { end: jest.fn() } as unknown as ServerResponse;

      jest.spyOn(SentryCore, 'hasTracingEnabled').mockReturnValueOnce(true);
      jest.spyOn(SentryNode, 'getCurrentHub').mockReturnValueOnce({
        getClient: () =>
          ({
            getOptions: () => ({ instrumenter: 'sentry' }),
          } as any),
        getScope: () => ({
          getTransaction: () => undefined,
        }),
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
