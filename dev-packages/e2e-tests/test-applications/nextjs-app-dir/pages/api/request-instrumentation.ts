import { get } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';

export default (_req: NextApiRequest, res: NextApiResponse) => {
  // make an outgoing request in order to test that the `Http` integration creates a span
  get('http://example.com/', message => {
    message.on('data', () => {
      // Noop consuming some data so that request can close :)
    });

    message.on('end', () => {
      setTimeout(() => {
        res.status(200).json({ message: 'Hello from Next.js!' });
      }, 500);
    });
  });
};
