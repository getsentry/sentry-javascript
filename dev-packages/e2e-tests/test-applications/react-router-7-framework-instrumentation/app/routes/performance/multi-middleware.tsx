import type { Route } from './+types/multi-middleware';

export const middleware: Route.MiddlewareFunction[] = [
  async function multiAuthMiddleware(_args, next) {
    return next();
  },
  async function multiLoggingMiddleware(_args, next) {
    return next();
  },
  async function multiValidationMiddleware(_args, next) {
    return next();
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
