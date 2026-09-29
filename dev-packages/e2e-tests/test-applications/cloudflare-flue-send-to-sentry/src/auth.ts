import { createMiddleware } from 'hono/factory';

/**
 * CI keeps the Worker after the run, and it holds an OpenRouter key. So the agent routes only answer
 * the test run that deployed the Worker, which sends the token that global-setup.ts made for it.
 */
export const requireTestToken = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const token = c.env.E2E_TEST_WORKER_TOKEN;
  if (!token || c.req.header('Authorization') !== `Bearer ${token}`) {
    return c.text('Unauthorized', 401);
  }
  await next();
});
