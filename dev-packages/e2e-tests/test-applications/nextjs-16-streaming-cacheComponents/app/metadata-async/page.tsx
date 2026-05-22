import * as Sentry from '@sentry/nextjs';

function fetchPost() {
  return Promise.resolve({ id: '1', title: 'Post 1' });
}

export async function generateMetadata() {
  const { id } = await fetchPost();
  const product = `Product: ${id}`;

  return {
    title: product,
  };
}

export default function Page() {
  return (
    <>
      <h1>This will be pre-rendered</h1>
      <DynamicContent />
    </>
  );
}

async function DynamicContent() {
  const getTodos = async () => {
    return Sentry.startSpan({ name: 'getTodos', op: 'get.todos' }, async () => {
      'use cache';
      await new Promise(resolve => setTimeout(resolve, 100));
      return [1, 2, 3, 4, 5];
    });
  };

  const todos = await getTodos();

  return <div id="todos-fetched">Todos fetched: {todos.length}</div>;
}
