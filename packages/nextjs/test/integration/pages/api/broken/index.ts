import { wrapApiHandlerWithSentry } from '@sentry/nextjs';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  res.status(500).json({ statusCode: 500, message: 'Something went wrong' });
};

export default wrapApiHandlerWithSentry(handler, '/api/broken');
