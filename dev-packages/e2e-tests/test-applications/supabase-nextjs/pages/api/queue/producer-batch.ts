import type { NextApiRequest, NextApiResponse } from 'next';
import { getQueueSupabaseClient } from '@/lib/initSupabaseQueue';

const supabaseClient = getQueueSupabaseClient();

type Data = {
  data?: unknown;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const { data, error } = await supabaseClient.rpc('send_batch', {
    queue_name: 'todos',
    messages: [
      {
        title: 'Test Todo 1',
      },
      {
        title: 'Test Todo 2',
      },
    ],
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ data });
}
