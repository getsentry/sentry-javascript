// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import * as Sentry from '@sentry/nextjs';
import { supabase } from '@/lib/initSupabase';

Sentry.addIntegration(Sentry.supabaseIntegration({
  supabaseClient: supabase,
}));

export const config = {
  runtime: 'edge',
};

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

export default async function handler() {
  const { user } = await login();

  await addTodoEntry(user?.id);

  const { data, error } = await supabase.from('todos').select('*');

  if (error) {
    console.log('error', error);
  }

  return new Response(
    JSON.stringify({
      data,
      error,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    },
  );
}
