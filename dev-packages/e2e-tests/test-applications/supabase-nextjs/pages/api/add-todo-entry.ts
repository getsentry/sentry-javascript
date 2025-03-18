// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/initSupabase';

type Data = {
  data: any;
  error: any;
};

async function login() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'test@sentry.test',
    password: 'sentry.test',
  });

  if (error) {
    console.log('error', error);
  }

  return data;
}

async function addTodoEntry(userId?: string) {
  const { error } = await supabase.from('todos').insert({ task: 'test', user_id: userId }).select().single();

  if (error) {
    console.log('error', error);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  const { user } = await login();

  await addTodoEntry(user?.id);

  const { data, error } = await supabase.from('todos').select('*');

  if (error) {
    console.log('error', error);
  }

  res.status(200).json({
    data,
    error,
  });
}
