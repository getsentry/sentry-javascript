import type { NextApiRequest, NextApiResponse } from 'next';
import { getSchemaCallSupabaseClient } from '@/lib/initSupabaseQueue';

const supabaseClient = getSchemaCallSupabaseClient();

type Data = {
  data?: unknown;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const { data, error } = await supabaseClient.schema('pgmq_public').rpc('pop', {
    queue_name: 'non-existing-queue',
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ data });
}
