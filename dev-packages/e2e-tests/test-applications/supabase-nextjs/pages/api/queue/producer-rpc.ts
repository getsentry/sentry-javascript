import type { NextApiRequest, NextApiResponse } from 'next';
import { getQueueSupabaseClient } from '@/lib/initSupabaseQueue';

const supabaseClient = getQueueSupabaseClient();

type Data = {
  data?: unknown;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const { data, error } = await supabaseClient.rpc('send', {
    queue_name: 'todos',
    message: {
      title: 'Test Todo',
    },
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ data });
}
