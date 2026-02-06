import type { Route } from './+types/other-middleware';

// Different middleware to test isolation between routes
export const middleware: Route.MiddlewareFunction[] = [
  async function rateLimitMiddleware({ context }, next) {
    (context as any).rateLimited = false;
    const response = await next();
    return response;
  },
];

export function loader() {
  return { message: 'Other middleware route loaded' };
}

export default function OtherMiddlewarePage() {
  return (
    <div>
      <h1 id="other-middleware-title">Other Middleware Route</h1>
      <p id="other-middleware-content">This route has a different middleware</p>
    </div>
  );
}
