import type { Route } from './+types/server-loader';

export function loader() {
  throw new Error('¡Madre mía del server!');
  return { data: 'sad' };
}

export default function ServerLoaderErrorPage({ loaderData }: Route.ComponentProps) {
  const { data } = loaderData;
  return (
    <div>
      <h1>Server Error Page</h1>
      <div>{data}</div>
    </div>
  );
}
