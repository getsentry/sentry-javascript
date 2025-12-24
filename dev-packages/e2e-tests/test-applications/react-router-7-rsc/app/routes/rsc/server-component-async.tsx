import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/server-component-async';

async function fetchData(): Promise<{ title: string; content: string }> {
  // Simulate async data fetch
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    title: 'Async Server Component',
    content: 'This content was fetched asynchronously on the server.',
  };
}

// Wrapped async server component for RSC mode
async function _AsyncServerComponent(_props: Route.ComponentProps) {
  const data = await fetchData();

  return (
    <main>
      <h1 data-testid="title">{data.title}</h1>
      <p data-testid="content">{data.content}</p>
    </main>
  );
}

export const ServerComponent = wrapServerComponent(_AsyncServerComponent, {
  componentRoute: '/rsc/server-component-async',
  componentType: 'Page',
});

// Loader fetches data in standard mode
export async function loader() {
  const data = await fetchData();
  return data;
}

// Default export for standard framework mode
// export default function AsyncServerComponentPage({ loaderData }: Route.ComponentProps) {
//   return (
//     <main>
//       <h1 data-testid="title">{loaderData?.title ?? 'Loading...'}</h1>
//       <p data-testid="content">{loaderData?.content ?? 'Loading...'}</p>
//     </main>
//   );
// }
