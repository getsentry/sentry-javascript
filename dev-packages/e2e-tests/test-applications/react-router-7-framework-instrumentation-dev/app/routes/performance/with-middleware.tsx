import type { Route } from './+types/with-middleware';

// Middleware runs before loaders/actions on matching routes
// With future.v8_middleware enabled, we export 'middleware' (not 'unstable_middleware')
export const middleware: Route.MiddlewareFunction[] = [
  async function authMiddleware({ context }, next) {
    // Code runs BEFORE handlers
    // Type assertion to allow setting custom properties on context
    (context as any).middlewareCalled = true;

    // Must call next() and return the response
    const response = await next();

    // Code runs AFTER handlers (can modify response headers here)
    return response;
  },
];

export function loader() {
  return { message: 'Middleware route loaded' };
}

export default function WithMiddlewarePage() {
  return (
    <div>
      <h1 id="middleware-route-title">Middleware Route</h1>
      <p id="middleware-route-content">This route has middleware</p>
    </div>
  );
}
