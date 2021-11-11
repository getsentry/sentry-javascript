import { withSentry } from '@sentry/nextjs';
import { get } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  // make an outgoing request in order to test that the `Http` integration creates a span
  await new Promise(resolve => get('http://example.com', resolve));

  res.status(200).json({});
};

export default withSentry(handler);
