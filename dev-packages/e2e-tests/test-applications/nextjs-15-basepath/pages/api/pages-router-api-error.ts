import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, _res: NextApiResponse) {
  throw new Error('Pages Router API route error with basePath');
}
