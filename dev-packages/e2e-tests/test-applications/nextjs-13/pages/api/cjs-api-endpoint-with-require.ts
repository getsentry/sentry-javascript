import { NextApiRequest, NextApiResponse } from 'next';

if (process.env.NEXT_PUBLIC_SOME_FALSE_ENV_VAR === 'enabled') {
  require('../../tests/server/utils/throw'); // Should not throw unless the hoisting in the wrapping loader is messed up!
}

const handler = async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  require('@sentry/nextjs').captureException; // Should not throw unless the wrapping loader messes up cjs imports
  // @ts-expect-error
  require.context('.'); // This is a webpack utility call. Should not throw unless the wrapping loader messes it up by mangling.
  res.status(200).json({ success: true });
};

module.exports = handler;
