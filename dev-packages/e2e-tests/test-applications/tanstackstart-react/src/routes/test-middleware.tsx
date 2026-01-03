import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { wrappedServerFnMiddleware } from '../middleware';

// Server function with specific middleware (also gets global function middleware)
const serverFnWithMiddleware = createServerFn()
  .middleware([wrappedServerFnMiddleware])
  .handler(async () => {
    console.log('Server function with specific middleware executed');
    return { message: 'Server function middleware test' };
  });

// Server function without specific middleware (only gets global function middleware)
const serverFnWithoutMiddleware = createServerFn().handler(async () => {
  console.log('Server function without specific middleware executed');
  return { message: 'Global middleware only test' };
});

export const Route = createFileRoute('/test-middleware')({
  component: TestMiddleware,
});

function TestMiddleware() {
  return (
    <div>
      <h1>Test Middleware Page</h1>
      <button
        id="server-fn-middleware-btn"
        type="button"
        onClick={async () => {
          await serverFnWithMiddleware();
        }}
      >
        Call server function with middleware
      </button>
      <button
        id="server-fn-global-only-btn"
        type="button"
        onClick={async () => {
          await serverFnWithoutMiddleware();
        }}
      >
        Call server function (global middleware only)
      </button>
    </div>
  );
}
