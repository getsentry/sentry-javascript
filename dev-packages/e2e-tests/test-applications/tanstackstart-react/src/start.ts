import { createStart } from '@tanstack/react-start';
// NOTE: These are NOT wrapped - auto-instrumentation via the Vite plugin will wrap them
import { globalRequestMiddleware, globalFunctionMiddleware } from './middleware';

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [globalRequestMiddleware],
    functionMiddleware: [globalFunctionMiddleware],
  };
});
