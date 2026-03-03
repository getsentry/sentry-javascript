import type { Route } from './+types/error-middleware';

export const middleware: Route.MiddlewareFunction[] = [
  async function errorMiddleware() {
    throw new Error('Middleware error for testing');
  },
];

export default function ErrorMiddlewarePage() {
  return (
    <div>
      <h1>Error Middleware Page</h1>
      <p>This should not render</p>
    </div>
  );
}
