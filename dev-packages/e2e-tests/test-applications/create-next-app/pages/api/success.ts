import * as Sentry from '@sentry/nextjs';
// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  Sentry.startSpan({ name: 'test-span' }, () => undefined);

  Sentry.flush().then(() => {
    res.status(200).json({});
  });
}
