import type { Route } from './+types/server-component-async';

async function fetchData(): Promise<{ title: string; content: string }> {
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    title: 'Async Server Component',
    content: 'This content was fetched asynchronously on the server.',
  };
}

export default async function AsyncServerComponent(_props: Route.ComponentProps) {
  const data = await fetchData();

  return (
    <main>
      <h1 data-testid="title">{data.title}</h1>
      <p data-testid="content">{data.content}</p>
    </main>
  );
}

export async function loader() {
  const data = await fetchData();
  return data;
}
