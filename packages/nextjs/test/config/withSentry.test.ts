import * as SentryCore from '@sentry/core';
import { addTracingExtensions } from '@sentry/core';
import type { Client, ClientOptions } from '@sentry/types';
import type { NextApiRequest, NextApiResponse } from 'next';

import type { AugmentedNextApiResponse, NextApiHandler } from '../../src/common/types';
import { withSentry } from '../../src/server';

// The wrap* functions require the hub to have tracing extensions. This is normally called by the NodeClient
// constructor but the client isn't used in these tests.
addTracingExtensions();

const FLUSH_DURATION = 200;

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Helper to prevent tests from ending before `flush()` has finished its work.
 *
 * This is necessary because, like its real-life counterpart, our mocked `res.send()` below doesn't await `res.end()
 * (which becomes async when we wrap it in `withSentry` in order to give `flush()` time to run). In real life, the
 * request/response cycle is held open as subsequent steps wait for `end()` to emit its `prefinished` event. Here in
 * tests, without any of that other machinery, we have to hold it open ourselves.
 *
 * @param wrappedHandler
 * @param req
 * @param res
 */
async function callWrappedHandler(wrappedHandler: NextApiHandler, req: NextApiRequest, res: NextApiResponse) {
  await wrappedHandler(req, res);

  // we know we need to wait at least this long for `flush()` to finish
  await sleep(FLUSH_DURATION);

  // should be <1 second, just long enough the `flush()` call to return, the original (pre-wrapping) `res.end()` to be
  // called, and the response to be marked as done
  while (!res.finished) {
    await sleep(100);
  }
}

const startTransactionSpy = jest.spyOn(SentryCore, 'startTransaction');

describe('withSentry', () => {
  let req: NextApiRequest, res: NextApiResponse;

  const origHandlerNoError: NextApiHandler = async (_req, res) => {
    res.send('Good dog, Maisey!');
  };

  // eslint-disable-next-line deprecation/deprecation
  const wrappedHandlerNoError = withSentry(origHandlerNoError);

  beforeEach(() => {
    req = { url: 'http://dogs.are.great' } as NextApiRequest;
    res = {
      send: function (this: AugmentedNextApiResponse) {
        this.end();
      },
      end: function (this: AugmentedNextApiResponse) {
        this.finished = true;
      },
    } as unknown as AugmentedNextApiResponse;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tracing', () => {
    it('starts a transaction and sets metadata when tracing is enabled', async () => {
      jest.spyOn(SentryCore.Hub.prototype, 'getClient').mockReturnValueOnce({
        getOptions: () => ({ tracesSampleRate: 1, instrumenter: 'sentry' } as ClientOptions),
      } as Client);

      await callWrappedHandler(wrappedHandlerNoError, req, res);

      expect(startTransactionSpy).toHaveBeenCalledWith(
        {
          name: 'GET http://dogs.are.great',
          op: 'http.server',
          origin: 'auto.http.nextjs.wrapApiHandlerWithSentry',

          metadata: {
            source: 'route',
            request: expect.objectContaining({ url: 'http://dogs.are.great' }),
          },
        },
        { request: expect.objectContaining({ url: 'http://dogs.are.great' }) },
      );
    });
  });
});
