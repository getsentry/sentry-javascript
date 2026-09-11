import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { startSpan } from '@sentry/tanstackstart-react';

const testLog = createServerFn().handler(async () => {
  console.log('Test log from server function');
  return { message: 'Log created' };
});

const testNestedLog = createServerFn().handler(async () => {
  await startSpan({ name: 'testNestedLog' }, async () => {
    await testLog();
  });

  console.log('Outer test log from server function');
  return { message: 'Nested log created' };
});

export const Route = createFileRoute('/test-serverFn')({
  component: TestLog,
});

function TestLog() {
  return (
    <div>
      <h1>Test Log Page</h1>
      <button
        type="button"
        onClick={async () => {
          await testLog();
        }}
      >
        Call server function
      </button>
      <button
        type="button"
        onClick={async () => {
          await testNestedLog();
        }}
      >
        Call server function nested
      </button>
    </div>
  );
}
