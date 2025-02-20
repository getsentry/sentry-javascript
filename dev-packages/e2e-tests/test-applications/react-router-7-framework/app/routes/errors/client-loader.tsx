import type { Route } from './+types/server-loader';

export function clientLoader() {
  throw new Error('¡Madre mía del client loader!');
  return { data: 'sad' };
}

export default function ClientLoaderErrorPage({ loaderData }: Route.ComponentProps) {
  const { data } = loaderData;
  return (
    <div>
      <h1>Client Loader Error Page</h1>
      <div>{data}</div>
    </div>
  );
}
