import type { Route } from './+types/multi-middleware';

// Multiple middleware functions to test index tracking
// Using unique names to avoid bundler renaming due to collisions with other routes
export const middleware: Route.MiddlewareFunction[] = [
  async function multiAuthMiddleware({ context }, next) {
    (context as any).auth = true;
    const response = await next();
    return response;
  },
  async function multiLoggingMiddleware({ context }, next) {
    (context as any).logged = true;
    const response = await next();
    return response;
  },
  async function multiValidationMiddleware({ context }, next) {
    (context as any).validated = true;
    const response = await next();
    return response;
  },
];

export function loader() {
  return { message: 'Multi-middleware route loaded' };
}

export default function MultiMiddlewarePage() {
  return (
    <div>
      <h1 id="multi-middleware-title">Multi Middleware Route</h1>
      <p id="multi-middleware-content">This route has 3 middlewares</p>
    </div>
  );
}
