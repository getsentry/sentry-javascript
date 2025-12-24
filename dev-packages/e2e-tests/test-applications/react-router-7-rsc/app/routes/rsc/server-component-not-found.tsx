import type { Route } from './+types/server-component-not-found';

// This route demonstrates that 404 responses are NOT captured as errors
export async function loader() {
  // Throw a 404 response
  throw new Response('Not Found', { status: 404 });
}

export default function NotFoundServerComponentPage() {
  return (
    <main>
      <h1>Not Found Server Component</h1>
      <p>This triggers a 404 response.</p>
    </main>
  );
}
