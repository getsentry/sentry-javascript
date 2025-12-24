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

// Export the wrapped component - used when RSC mode is enabled
export const ServerComponent = wrapServerComponent(_ServerComponent, {
  componentRoute: '/rsc/server-component',
  componentType: 'Page',
});

export async function loader() {
  return { message: 'Hello from server loader!' };
}

// Default export for standard framework mode
// export default function ServerComponentPage({ loaderData }: Route.ComponentProps) {
//   return (
//     <main>
//       <h1>Server Component Page</h1>
//       <p data-testid="loader-message">Loader: {loaderData?.message ?? 'No loader data'}</p>
//     </main>
//   );
// }
