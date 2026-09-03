import { attachHapiErrorHandler } from '@sentry/server-utils';

/**
 * Add a Hapi plugin to capture errors to Sentry.
 *
 * @deprecated The error handler is now registered automatically when the Hapi
 * server starts (via the orchestrion `@hapi/hapi` instrumentation), so calling
 * this is no longer necessary. It remains a safe, idempotent operation when the
 * handler is already attached, and is kept for setups where auto-registration is
 * unavailable. This will be removed in a future major version.
 *
 * @param server The Hapi server to attach the error handler to
 */
export async function setupHapiErrorHandler(server: unknown): Promise<void> {
  // oxlint-disable-next-line typescript/no-deprecated
  attachHapiErrorHandler(server as Parameters<typeof attachHapiErrorHandler>[0]);
}
