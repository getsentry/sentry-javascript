import * as Sentry from '@sentry/node';
import * as utils from '@sentry/utils';
import { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

import { AugmentedNextApiResponse, withSentry, WrappedNextApiHandler } from '../../src/utils/withSentry';

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
async function callWrappedHandler(wrappedHandler: WrappedNextApiHandler, req: NextApiRequest, res: NextApiResponse) {
  await wrappedHandler(req, res);

  // we know we need to wait at least this long for `flush()` to finish
  await sleep(FLUSH_DURATION);

  // should be <1 second, just long enough the `flush()` call to return, the original (pre-wrapping) `res.end()` to be
  // called, and the response to be marked as done
  while (!res.finished) {
    await sleep(100);
  }
}

// We mock `captureException` as a no-op because under normal circumstances it is an un-awaited effectively-async
// function which might or might not finish before any given test ends, potentially leading jest to error out.
const captureExceptionSpy = jest.spyOn(Sentry, 'captureException').mockImplementation(jest.fn());
const loggerSpy = jest.spyOn(utils.logger, 'log');
const flushSpy = jest.spyOn(Sentry, 'flush').mockImplementation(async () => {
  // simulate the time it takes time to flush all events
  await sleep(FLUSH_DURATION);
  return true;
});

describe('withSentry', () => {
  let req: NextApiRequest, res: NextApiResponse;

  const noShoesError = new Error('Oh, no! Charlie ate the flip-flops! :-(');

  const origHandlerNoError: NextApiHandler = async (_req, res) => {
    res.send('Good dog, Maisey!');
  };
  const origHandlerWithError: NextApiHandler = async (_req, _res) => {
    throw noShoesError;
  };

  const wrappedHandlerNoError = withSentry(origHandlerNoError);
  const wrappedHandlerWithError = withSentry(origHandlerWithError);

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

  describe('flushing', () => {
    it('flushes events before rethrowing error', async () => {
      try {
        await callWrappedHandler(wrappedHandlerWithError, req, res);
      } catch (err) {
        expect(err).toBe(noShoesError);
      }

      expect(captureExceptionSpy).toHaveBeenCalledWith(noShoesError);
      expect(flushSpy).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith('Done flushing events');

      // This ensures the expect inside the `catch` block actually ran, i.e., that in the end the wrapped handler
      // errored out the same way it would without sentry, meaning the error was indeed rethrown
      expect.assertions(4);
    });

    it('flushes events before finishing non-erroring response', async () => {
      await callWrappedHandler(wrappedHandlerNoError, req, res);

      expect(flushSpy).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith('Done flushing events');
    });
  });
});
