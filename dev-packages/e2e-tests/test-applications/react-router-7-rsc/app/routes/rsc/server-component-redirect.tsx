import { redirect } from 'react-router';
import type { Route } from './+types/server-component-redirect';

// This route demonstrates that redirects are NOT captured as errors
export async function loader() {
  // Redirect to home page
  throw redirect('/');
}

export default function RedirectServerComponentPage() {
  return (
    <main>
      <h1>Redirect Server Component</h1>
      <p>You should be redirected and not see this.</p>
    </main>
  );
}
