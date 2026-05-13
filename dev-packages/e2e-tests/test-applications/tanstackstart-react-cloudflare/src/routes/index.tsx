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
      <h1>TanStack Start Cloudflare E2E Test</h1>
      <button
        id="client-error-btn"
        type="button"
        onClick={() => {
          throw new Error('Sentry Client Test Error');
        }}
      >
        Break the client
      </button>
      <button
        id="throw-server-fn-btn"
        type="button"
        onClick={async () => {
          await throwServerError();
        }}
      >
        Break server function
      </button>
      <button
        id="api-error-btn"
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
