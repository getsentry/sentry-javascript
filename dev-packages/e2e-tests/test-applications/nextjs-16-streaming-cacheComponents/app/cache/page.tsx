import { Suspense } from 'react';
import * as Sentry from '@sentry/nextjs';

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
