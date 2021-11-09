import * as Sentry from '@sentry/node';
import * as utils from '@sentry/utils';
import { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

import { AugmentedNextApiResponse, withSentry, WrappedNextApiHandler } from '../../src/utils/withSentry';

const FLUSH_DURATION = 200;

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function callWrappedHandler(wrappedHandler: WrappedNextApiHandler, req: NextApiRequest, res: NextApiResponse) {
  await wrappedHandler(req, res);

  // Within the wrapped handler, we await `flush()` inside `res.end()`, but nothing awaits `res.end()`, because in its
  // original version, it's sync (unlike the function we wrap around it). The original does actually *act* like an async
  // function being awaited - subsequent steps in the request/response lifecycle don't happen until it emits a
  // `prefinished` event (which is why it's safe for us to make the switch). But here in tests, there's nothing past
  // `res.end()`, so we have to manually wait for it to be done.
  await sleep(FLUSH_DURATION);
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

  const error = new Error('Oh, no! Charlie ate the flip-flops! :-(');

  const origHandlerNoError: NextApiHandler = async (_req, res) => {
    res.send('Good dog, Maisey!');
  };
  const origHandlerWithError: NextApiHandler = async (_req, _res) => {
    throw error;
  };

  const wrappedHandlerNoError = withSentry(origHandlerNoError);
  const wrappedHandlerWithError = withSentry(origHandlerWithError);

  beforeEach(() => {
    req = { url: 'http://dogs.are.great' } as NextApiRequest;
    res = ({
      send: function(this: AugmentedNextApiResponse) {
        this.end();
      },
      end: function(this: AugmentedNextApiResponse) {
        this.finished = true;
      },
    } as unknown) as AugmentedNextApiResponse;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('flushing', () => {
    it('flushes events before rethrowing error', async () => {
      try {
        await callWrappedHandler(wrappedHandlerWithError, req, res);
      } catch (err) {
        expect(err).toBe(error);
      }

      expect(captureExceptionSpy).toHaveBeenCalledWith(error);
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
