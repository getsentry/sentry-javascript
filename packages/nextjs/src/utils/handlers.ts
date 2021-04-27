import { captureException, flush } from '@sentry/node';
import { NextApiRequest, NextApiResponse } from 'next';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // TODO: Start Transaction
      // TODO: Extract data from req
      return await handler(req, res); // Call Handler
      // TODO: Finish Transaction
    } catch (e) {
      captureException(e);
      await flush(2000);
      throw e;
    }
  };
};
