import Head from 'next/head';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { Auth } from '@supabase/auth-ui-react';
import TodoList from '@/components/TodoList';

export default function Home() {
  const session = useSession();
  const supabase = useSupabaseClient();

  return (
    <>
      <Head>
        <title>Create Next App</title>
        <meta name="description" />
        <meta name="viewport" />
      </Head>
      <div>
        {!session ? (
          <div>
            <span>Login</span>
            <Auth supabaseClient={supabase} />
          </div>
        ) : (
          <div>
            <TodoList session={session} />
            <button
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) console.log('Error logging out:', error.message);
              }}
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
