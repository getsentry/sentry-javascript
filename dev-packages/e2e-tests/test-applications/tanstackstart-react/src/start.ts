import { createMiddleware, createStart } from '@tanstack/react-start';

const loggingMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Log from global request middleware!');
  return next();
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [loggingMiddleware],
  };
});
