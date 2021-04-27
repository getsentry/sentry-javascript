import { captureException } from '@sentry/node';
import { NextApiRequest, NextApiResponse } from 'next';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      return await handler(req, res);
    } catch (e) {
      captureException(e);
    }
  };
};
