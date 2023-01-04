import * as SentryCore from '@sentry/core';
import * as SentryTracing from '@sentry/tracing';
import type { IncomingMessage, ServerResponse } from 'http';

import { withSentryGetServerSideProps, withSentryServerSideGetInitialProps } from '../../src/server';

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
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('withSentryGetServerSideProps', async () => {
      const origFunction = jest.fn(async () => ({ props: {} }));

      const wrappedOriginal = withSentryGetServerSideProps(origFunction, route);
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

    test('withSentryServerSideGetInitialProps', async () => {
      const origFunction = jest.fn(async () => ({}));

      const wrappedOriginal = withSentryServerSideGetInitialProps(origFunction);
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
