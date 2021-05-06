import { captureException, flush, Handlers, withScope } from '@sentry/node';
import { addExceptionMechanism } from '@sentry/utils';
import { NextApiHandler } from 'next';

const { parseRequest } = Handlers;

// purely for clarity
type WrappedNextApiHandler = NextApiHandler;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (handler: NextApiHandler): WrappedNextApiHandler => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req, res) => {
    try {
      // TODO: Start Transaction
      return await handler(req, res); // Call Handler
      // TODO: Finish Transaction
    } catch (e) {
      withScope(scope => {
        scope.addEventProcessor(event => {
          addExceptionMechanism(event, {
            handled: false,
          });
          return parseRequest(event, req);
        });
        captureException(e);
      });
      throw e;
    } finally {
      await flush(2000);
    }
  };
};
