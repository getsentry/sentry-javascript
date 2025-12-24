import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/server-component-error';

// Demonstrate error capture in wrapServerComponent
async function _ServerComponentWithError(_props: Route.ComponentProps) {
  throw new Error('RSC Server Component Error: Mamma mia!');
}

export const ServerComponent = wrapServerComponent(_ServerComponentWithError, {
  componentRoute: '/rsc/server-component-error',
  componentType: 'Page',
});

// For testing, we can trigger the wrapped component via a loader
export async function loader() {
  // Call the wrapped ServerComponent to test error capture
  try {
    await ServerComponent({} as Route.ComponentProps);
  } catch (e) {
    // Error is captured by Sentry, rethrow for error boundary
    throw e;
  }
  return {};
}

// export default function ServerComponentErrorPage() {
//   return (
//     <main>
//       <h1>Server Component Error Page</h1>
//     </main>
//   );
// }
