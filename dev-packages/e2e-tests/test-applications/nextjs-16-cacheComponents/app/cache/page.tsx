import { Suspense } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Page() {
  return (
    <>
      <h1>This will be pre-rendered</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicContent />
      </Suspense>
    </>
  );
}

async function DynamicContent() {
  const getTodos = () => {
    return Sentry.startSpan({ name: 'DynamicContent', op: 'fetch' }, () => {
      return [1, 2, 3, 4, 5];
    });
  };
  const todos = await getTodos();

  return <div id="todos-fetched">Todos fetched: {todos.length}</div>;
}
