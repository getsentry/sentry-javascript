import { createFileRoute } from '@tanstack/react-router';

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
