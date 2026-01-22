import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/server-component';

// Demonstrate wrapServerComponent - this wrapper can be used to instrument
// server components when RSC Framework Mode is enabled
async function _ServerComponent({ loaderData }: Route.ComponentProps) {
  await new Promise(resolve => setTimeout(resolve, 10));

  return (
    <main>
      <h1>Server Component</h1>
      <p>This demonstrates a wrapped server component.</p>
      <p data-testid="loader-message">Message: {loaderData?.message ?? 'No loader data'}</p>
    </main>
  );
}

export async function loader() {
  return { message: 'Hello from server loader!' };
}

export default wrapServerComponent(_ServerComponent, {
  componentRoute: '/rsc/server-component',
  componentType: 'Page',
});
