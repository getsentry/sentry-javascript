import type { Route } from './+types/server-component';

export default async function ServerComponent({ loaderData }: Route.ComponentProps) {
  await new Promise(resolve => setTimeout(resolve, 10));

  return (
    <main>
      <h1>Server Component</h1>
      <p>This demonstrates an auto-wrapped server component.</p>
      <p data-testid="loader-message">Message: {loaderData?.message ?? 'No loader data'}</p>
    </main>
  );
}

export async function loader() {
  return { message: 'Hello from server loader!' };
}
