import type { MiddlewareHandler } from 'hono';

export const middlewareA: MiddlewareHandler = async function middlewareA(c, next) {
  // Add some delay
  await new Promise(resolve => setTimeout(resolve, 50));
  await next();
};

export const middlewareB: MiddlewareHandler = async function middlewareB(_c, next) {
  // Add some delay
  await new Promise(resolve => setTimeout(resolve, 60));
  await next();
};

export const failingMiddleware: MiddlewareHandler = async function failingMiddleware(_c, _next) {
  throw new Error('Middleware error');
};
