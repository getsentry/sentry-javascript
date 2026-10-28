import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { serverFnMiddleware, earlyReturnMiddleware, errorMiddleware } from '../middleware';

// Server function with specific middleware (also gets global function middleware)
const serverFnWithMiddleware = createServerFn()
  .middleware([serverFnMiddleware])
  .handler(async () => {
    console.log('Server function with specific middleware executed');
    return { message: 'Server function middleware test' };
  });

// Server function without specific middleware (only gets global function middleware)
const serverFnWithoutMiddleware = createServerFn().handler(async () => {
  console.log('Server function without specific middleware executed');
  return { message: 'Global middleware only test' };
});

// Server function with early return middleware (middleware returns without calling next)
const serverFnWithEarlyReturnMiddleware = createServerFn()
  .middleware([earlyReturnMiddleware])
  .handler(async () => {
    console.log('This should not be executed - middleware returned early');
    return { message: 'This should not be returned' };
  });

// Server function with error middleware (middleware throws an error)
const serverFnWithErrorMiddleware = createServerFn()
  .middleware([errorMiddleware])
  .handler(async () => {
    console.log('This should not be executed - middleware threw error');
    return { message: 'This should not be returned' };
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
      <button
        id="server-fn-early-return-btn"
        type="button"
        onClick={async () => {
          const result = await serverFnWithEarlyReturnMiddleware();
          console.log('Early return result:', result);
        }}
      >
        Call server function with early return middleware
      </button>
      <button
        id="server-fn-error-btn"
        type="button"
        onClick={async () => {
          try {
            await serverFnWithErrorMiddleware();
          } catch (error) {
            console.log('Caught error from middleware:', error);
          }
        }}
      >
        Call server function with error middleware
      </button>
    </div>
  );
}
