import { wrapServerComponent } from '@sentry/react-router';

async function fetchData(): Promise<{ title: string; content: string }> {
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    title: 'Async Server Component',
    content: 'This content was fetched asynchronously on the server.',
  };
}

async function AsyncServerComponent() {
  const data = await fetchData();

  return (
    <main>
      <h1 data-testid="title">{data.title}</h1>
      <p data-testid="content">{data.content}</p>
    </main>
  );
}

export default wrapServerComponent(AsyncServerComponent, {
  componentRoute: '/rsc/server-component-async',
  componentType: 'Page',
});
