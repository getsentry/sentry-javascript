import * as Sentry from '@sentry/nextjs';
// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const transaction = Sentry.startTransaction({ name: 'test-transaction', op: 'e2e-test' });
  Sentry.getCurrentHub().getScope().setSpan(transaction);

  const span = transaction.startChild();

  span.end();
  transaction.end();

  Sentry.flush().then(() => {
    res.status(200).json({
      transactionIds: global.transactionIds,
    });
  });
}
