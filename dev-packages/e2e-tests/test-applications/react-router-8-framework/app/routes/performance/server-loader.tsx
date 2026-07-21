import type { Route } from './+types/server-loader';

export async function loader() {
  await new Promise(resolve => setTimeout(resolve, 500));
  return { data: 'burritos' };
}

export default function ServerLoaderPage({ loaderData }: Route.ComponentProps) {
  const { data } = loaderData;
  return (
    <div>
      <h1>Server Loader Page</h1>
      <div>{data}</div>
    </div>
  );
}
