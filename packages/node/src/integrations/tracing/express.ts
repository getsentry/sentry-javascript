import { setupExpressErrorHandler as coreSetupExpressErrorHandler, type ExpressHandlerOptions } from '@sentry/core';
export { expressErrorHandler } from '@sentry/core';

export function setupExpressErrorHandler(
  //oxlint-disable-next-line no-explicit-any
  app: { use: (middleware: any) => unknown },
  options?: ExpressHandlerOptions,
): void {
  coreSetupExpressErrorHandler(app, options);
}
