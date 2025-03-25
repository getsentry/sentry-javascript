// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseClient } from '@/lib/initSupabaseAdmin';

type Data = {
  data: any;
  error: any;
};

async function deleteExistingUsers() {
  const { data: { users }, error } = await supabaseClient.auth.admin.listUsers()

  for (const user of users) {
    const { error } = await supabaseClient.auth.admin.deleteUser(user.id, true);
    if (error) console.log('error', error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  await deleteExistingUsers();

  const { data, error } = await supabaseClient.auth.admin.createUser({
    email: 'test@sentry.test',
    password: 'sentry.test',
    email_confirm: true,
  });

  res.status(200).json({
    data,
    error,
   });
}
