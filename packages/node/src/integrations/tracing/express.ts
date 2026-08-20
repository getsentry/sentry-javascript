// oxlint-disable-next-line typescript/no-deprecated
import { setupExpressErrorHandler as coreSetupExpressErrorHandler, type ExpressHandlerOptions } from '@sentry/core';
// oxlint-disable-next-line typescript/no-deprecated
export { expressErrorHandler } from '@sentry/core';

/**
 * Add an Express error handler to capture errors to Sentry.
 *
 * @deprecated `expressIntegration()` now captures errors automatically, so calling this is no longer
 * necessary. To customize which errors are captured, pass `shouldHandleError` to `expressIntegration()`.
 * This export is deprecated and will be removed in the next major version.
 */
export function setupExpressErrorHandler(
  //oxlint-disable-next-line no-explicit-any
  app: { use: (middleware: any) => unknown },
  // oxlint-disable-next-line typescript/no-deprecated
  options?: ExpressHandlerOptions,
): void {
  // oxlint-disable-next-line typescript/no-deprecated
  coreSetupExpressErrorHandler(app, options);
}
