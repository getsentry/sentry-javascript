import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react';
import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

// A custom `start.ts` turns off the CSRF protection that Start installs for server functions by default.
const csrfMiddleware = createCsrfMiddleware({ filter: ctx => ctx.handlerType === 'serverFn' });

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [sentryGlobalRequestMiddleware, csrfMiddleware],
    functionMiddleware: [sentryGlobalFunctionMiddleware],
  };
});
