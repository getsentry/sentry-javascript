import type { NextApiRequest, NextApiResponse } from 'next';
import { getQueueSupabaseClient } from '@/lib/initSupabaseQueue';

const supabaseClient = getQueueSupabaseClient();

type Data = {
  data?: unknown;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const { data, error } = await supabaseClient.rpc('pop', {
    queue_name: 'todos',
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ data });
}
