import { captureException, flush, Handlers, withScope } from '@sentry/node';
import { NextApiRequest, NextApiResponse } from 'next';

const { parseRequest } = Handlers;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // TODO: Start Transaction
      return await handler(req, res); // Call Handler
      // TODO: Finish Transaction
    } catch (e) {
      withScope(scope => {
        scope.addEventProcessor(event => parseRequest(event, req));
        captureException(e);
      });
      await flush(2000);
      throw e;
    }
  };
};
