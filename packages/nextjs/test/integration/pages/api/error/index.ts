import { NextApiRequest, NextApiResponse } from 'next';

const handler = async (_req: NextApiRequest, _res: NextApiResponse): Promise<void> => {
  throw new Error('API Error');
};

export default handler;
