import { createStart } from '@tanstack/react-start';
import { wrappedGlobalRequestMiddleware, wrappedGlobalFunctionMiddleware } from './middleware';

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [wrappedGlobalRequestMiddleware],
    functionMiddleware: [wrappedGlobalFunctionMiddleware],
  };
});
