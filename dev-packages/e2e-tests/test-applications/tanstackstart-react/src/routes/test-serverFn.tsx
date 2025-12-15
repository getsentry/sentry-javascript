import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

const testLog = createServerFn().handler(async () => {
  console.log('Test log from server function');
  return { message: 'Log created' };
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
    </div>
  );
}
