import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/initSupabaseAdmin';

type Data = {
  data: any;
  error: any;
};

const supabaseClient = getSupabaseClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const { data, error } = await supabaseClient.auth.admin.listUsers();

  if (error) {
    console.warn('ERROR', error);
  }

  res.status(200).json({
    data,
    error,
  });
}
