import {
  addNonEnumerableProperty,
  captureException,
  debug,
  getClient,
  isAlreadyCaptured,
  isObjectLike,
  parseUrl,
} from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import { DEBUG_BUILD } from '../../debug-build';
import type { NitroApp, NitroCapturedErrorContext } from './nitroTypes';

// On the app, not in module scope: `@sentry/nitro`'s runtime plugin bundles its own copy of this module.
const NITRO_ERROR_CAPTURE_MARKER = Symbol.for('sentry.nitro.errorCapture');

interface H3HTTPError extends Error {
  status: number;
  cause?: unknown;
}

// Same check as h3's `HTTPError.isError`, so we don't depend on h3.
function isH3HTTPError(error: unknown): error is H3HTTPError {
  return error instanceof Error && error.name === 'HTTPError' && (error as H3HTTPError).status > 99;
}

function extractErrorContext(errorContext: NitroCapturedErrorContext | undefined): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  if (!errorContext) {
    return ctx;
  }

  if (errorContext.event) {
    ctx.method = errorContext.event.req.method;
    ctx.path = parseUrl(errorContext.event.req.url).path;
  }

  if (Array.isArray(errorContext.tags)) {
    ctx.tags = errorContext.tags;
  }

  return ctx;
}

/**
 * Captures an error passed to Nitro's `error` hook and sends it to Sentry.
 */
export async function captureNitroRequestError(
  error: unknown,
  errorContext?: NitroCapturedErrorContext,
): Promise<void> {
  const sentryClientOptions = getClient()?.getOptions();

  if (
    sentryClientOptions &&
    'enableNitroErrorHandler' in sentryClientOptions &&
    sentryClientOptions.enableNitroErrorHandler === false
  ) {
    return;
  }

  // Do not report HTTPErrors with 3xx or 4xx status codes
  if (isH3HTTPError(error) && error.status >= 300 && error.status < 500) {
    return;
  }

  // Nitro wraps errors thrown in handlers in an `HTTPError`, so an error the SDK already captured (for example in a
  // task) would be reported a second time through the wrapper.
  if (isH3HTTPError(error) && isAlreadyCaptured(error.cause)) {
    return;
  }

  captureException(error, {
    captureContext: { contexts: { nitro: extractErrorContext(errorContext) } },
    mechanism: { handled: false, type: 'auto.function.nitro.captureErrorHook' },
  });

  await flushIfServerless();
}

/**
 * Captures an error thrown by a Nitro task and sends it to Sentry.
 */
export async function captureNitroTaskError(error: unknown, taskName: string): Promise<void> {
  captureException(error, {
    captureContext: { contexts: { nitro: { task: taskName } } },
    mechanism: { handled: false, type: 'auto.function.nitro.task' },
  });

  await flushIfServerless();
}

/**
 * Registers error capture on a Nitro app, at most once per app. Both `@sentry/nitro`'s runtime plugin
 * and `nitroIntegration` (through the orchestrion `useNitroApp` channel) call this, so an error is
 * captured once, whichever of the two runs first.
 */
export function setupNitroErrorCapture(nitroApp: unknown): void {
  if (!isObjectLike(nitroApp) || NITRO_ERROR_CAPTURE_MARKER in nitroApp) {
    return;
  }
  addNonEnumerableProperty(nitroApp, NITRO_ERROR_CAPTURE_MARKER, true);

  const app = nitroApp as NitroApp;
  if (app.hooks) {
    app.hooks.hook('error', captureNitroRequestError);
    return;
  }

  // Without plugins or `features.runtimeHooks`, Nitro builds the app without hooks: its `captureError`
  // calls no `error` hook, and h3's `onError` doesn't call `captureError` at all. Wrap both instead.
  const originalCaptureError = app.captureError;
  app.captureError = (error, errorContext) => {
    captureNitroErrorInBackground(error, errorContext);
    originalCaptureError?.(error, errorContext);
  };

  const h3Config = app.h3?.config;
  const originalOnError = h3Config?.onError;
  if (h3Config && originalOnError) {
    h3Config.onError = (error, event) => {
      captureNitroErrorInBackground(error, { event });
      return originalOnError(error, event);
    };
  }
}

// Mirrors what Nitro does with the `error` hook's promise when the app has hooks.
function captureNitroErrorInBackground(error: unknown, errorContext: NitroCapturedErrorContext): void {
  const promise = captureNitroRequestError(error, errorContext).catch(captureError => {
    DEBUG_BUILD && debug.warn('Error while capturing a Nitro error', captureError);
  });
  errorContext.event?.req.waitUntil?.(promise);
}
