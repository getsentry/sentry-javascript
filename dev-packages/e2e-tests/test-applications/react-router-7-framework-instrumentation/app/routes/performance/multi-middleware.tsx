import type { Route } from './+types/multi-middleware';

export const middleware: Route.MiddlewareFunction[] = [
  async function authMiddleware(_args, next) {
    return next();
  },
  async function loggingMiddleware(_args, next) {
    return next();
  },
  async function validationMiddleware(_args, next) {
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
