import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

const throwServerError = createServerFn().handler(async () => {
  throw new Error('Sentry Server Function Test Error');
});

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          throw new Error('Sentry Client Test Error');
        }}
      >
        Break the client
      </button>
      <button
        type="button"
        onClick={async () => {
          await throwServerError();
        }}
      >
        Break server function
      </button>
      <button
        type="button"
        onClick={async () => {
          await fetch('/api/error');
        }}
      >
        Break API route
      </button>
    </div>
  );
}
