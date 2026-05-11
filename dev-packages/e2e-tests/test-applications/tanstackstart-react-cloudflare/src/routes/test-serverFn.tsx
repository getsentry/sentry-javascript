import * as Sentry from '@sentry/cloudflare';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

const testLog = createServerFn().handler(async () => {
  console.log('Test log from server function');
  return { message: 'Log created' };
});

const testNestedLog = createServerFn().handler(async () => {
  await Sentry.startSpan({ name: 'testNestedLog' }, async () => {
    await testLog();
  });

  console.log('Outer test log from server function');
  return { message: 'Nested log created' };
});

export const Route = createFileRoute('/test-serverFn')({
  component: TestServerFn,
});

function TestServerFn() {
  return (
    <div>
      <h1>Test Server Function Page</h1>
      <button
        id="server-fn-btn"
        type="button"
        onClick={async () => {
          await testLog();
        }}
      >
        Call server function
      </button>
      <button
        id="server-fn-nested-btn"
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
