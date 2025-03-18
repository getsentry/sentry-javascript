// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/initSupabase';

type Data = {
  data: any;
  error: any;
};

async function deleteExistingUsers() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers()

  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id, true);
    if (error) console.log('error', error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  await deleteExistingUsers();

  const { data, error } = await supabase.auth.admin.createUser({
    email: 'test@sentry.test',
    password: 'sentry.test',
    email_confirm: true,
  });

  res.status(200).json({
    data,
    error,
   });
}
