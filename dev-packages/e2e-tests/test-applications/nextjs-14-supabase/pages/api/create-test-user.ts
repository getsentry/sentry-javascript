import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/initSupabaseAdmin';

type Data = {
  data: any;
  error: any;
};

const supabaseClient = getSupabaseClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  // Note for test usage
  // This only works once in tests as it will error if the user already exists
  // So this should be called only once before all tests to create the user
  const { data, error } = await supabaseClient.auth.admin.createUser({
    email: 'test@sentry.test',
    password: 'sentry.test',
    email_confirm: true,
  });

  if (error) {
    console.warn('ERROR', error);
  }

  res.status(200).json({
    data,
    error,
  });
}
