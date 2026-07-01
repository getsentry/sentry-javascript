import { Suspense } from 'react';
import { headers } from 'next/headers';
import * as Sentry from '@sentry/nextjs';

async function CachedContent() {
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

async function DynamicContent() {
  await headers();
  return (
    <>
      <CachedContent />
    </>
  );
}

export default function Page() {
  return (
    <>
      <h1>Cache Pageload Tracing</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicContent />
      </Suspense>
    </>
  );
}
