import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/initSupabaseAdmin';

const supabaseClient = getSupabaseClient();

type Data = {
  data: unknown;
  error: unknown;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const { data, error } = await supabaseClient.rpc('get_supabase_status');

  if (error) {
    console.warn('Supabase RPC status check failed', error);
    res.status(500).json({ data, error });
    return;
  }

  res.status(200).json({ data, error });
}
