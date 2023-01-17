import { wrapApiHandlerWithSentry } from '@sentry/nextjs';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  res.status(200).json({});
};

export default wrapApiHandlerWithSentry(handler, '/api/wrapApiHandlerWithSentry/wrapped/noParams');
