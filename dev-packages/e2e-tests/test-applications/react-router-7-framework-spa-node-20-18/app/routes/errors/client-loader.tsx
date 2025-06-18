import type { Route } from './+types/client-loader';

export function clientLoader() {
  throw new Error('¡Madre mía del client loader!');
}

export default function ClientLoaderErrorPage({ loaderData }: Route.ComponentProps) {
  const { data } = loaderData ?? { data: 'sad' };
  return (
    <div>
      <h1>Client Loader Error Page</h1>
      <div>{data}</div>
    </div>
  );
}
