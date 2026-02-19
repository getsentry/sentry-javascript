import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/server-component';

async function ServerComponent({ loaderData }: Route.ComponentProps) {
  await new Promise(resolve => setTimeout(resolve, 10));

  return (
    <main>
      <h1>Server Component</h1>
      <p data-testid="loader-message">Message: {loaderData?.message ?? 'No loader data'}</p>
    </main>
  );
}

export default wrapServerComponent(ServerComponent, {
  componentRoute: '/rsc/server-component',
  componentType: 'Page',
});

export async function loader() {
  return { message: 'Hello from server loader!' };
}
