import * as Sentry from '@sentry/nextjs';

/**
 * Tests generateMetadata function with cache components, this calls the propagation context to be set
 * Which will generate and set a trace id in the propagation context, which should trigger the random API error if unpatched
 * See: https://github.com/getsentry/sentry-javascript/issues/18392
 */
export function generateMetadata() {
  return {
    title: 'Cache Components Metadata Test',
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
