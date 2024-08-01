import { NextApiRequest, NextApiResponse } from 'next';

export default async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  res.status(200).json({ success: true });
};
