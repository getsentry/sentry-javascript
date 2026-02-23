import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from '@sentry/tanstackstart-react';
import { createStart } from '@tanstack/react-start';
// NOTE: These are NOT wrapped - auto-instrumentation via the Vite plugin will wrap them
import { globalFunctionMiddleware, globalRequestMiddleware } from './middleware';

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [sentryGlobalRequestMiddleware, globalRequestMiddleware],
    functionMiddleware: [sentryGlobalFunctionMiddleware, globalFunctionMiddleware],
  };
});
