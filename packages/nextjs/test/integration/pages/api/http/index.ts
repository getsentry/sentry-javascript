import { get } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  // make an outgoing request in order to test that the `Http` integration creates a span
  await new Promise<void>(resolve =>
    get('http://example.com/', message => {
      message.on('data', () => {
        // Noop consuming some data so that request can close :)
      });

      message.on('close', resolve);
    }),
  );

  res.status(200).json({});
};

export default handler;
