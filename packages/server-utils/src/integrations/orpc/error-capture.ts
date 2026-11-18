import * as diagnosticsChannel from '../../utils/diagnosticsChannel';
import {
  captureException,
  getClient,
  isObjectLike,
  normalize,
  setNormalizationDepthOverrideHint,
  withScope,
} from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import { safeChannelCallback } from '../../tracing-channel';
import { ORPC_ORIGIN } from './tracer';

/** Decides whether an error thrown by an oRPC procedure is captured as an issue. */
export type ORPCShouldHandleError = (error: unknown) => boolean;

interface ProcedureOptions {
  path?: unknown;
  input?: unknown;
}

// The codes of oRPC's default error status map with a 5xx status. Other codes, including custom ones, map to 4xx.
const SERVER_ERROR_CODES = new Set([
  'INTERNAL_SERVER_ERROR',
  'NOT_IMPLEMENTED',
  'BAD_GATEWAY',
  'SERVICE_UNAVAILABLE',
  'GATEWAY_TIMEOUT',
]);

/**
 * Captures every error except `ORPCError`s that oRPC responds to with a 4xx status, such as `NOT_FOUND` or
 * input validation failures, and abort errors. oRPC responds to any error other than an `ORPCError` with a 500.
 */
export function defaultShouldHandleError(error: unknown): boolean {
  if (!isObjectLike(error)) {
    return true;
  }
  if (error.name === 'AbortError') {
    return false;
  }
  if (error.name === 'ORPCError') {
    return typeof error.code === 'string' && SERVER_ERROR_CODES.has(error.code);
  }
  return true;
}

/**
 * Captures the errors thrown by oRPC procedures.
 *
 * oRPC catches these errors and encodes them into an error response, so no HTTP error handler sees them,
 * and its tracer only receives a copy without the original error. Until oRPC passes the original error to
 * `TracingSpan.recordException` (https://github.com/middleapi/orpc/issues/2493), the procedure execution is
 * hooked through orchestrion instead. Once that lands, this can move into the tracer.
 */
export function instrumentORPCErrors(shouldHandleError: ORPCShouldHandleError): void {
  diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.ORPC_EXECUTE_PROCEDURE).subscribe({
    start() {},
    end() {},
    asyncStart() {},
    asyncEnd(ctx) {
      safeChannelCallback(() => {
        if (ctx.error === undefined) {
          captureAsyncIteratorErrors(ctx.result, ctx.arguments[1] as ProcedureOptions | undefined, shouldHandleError);
        }
      });
    },
    error(ctx) {
      safeChannelCallback(() =>
        captureProcedureError(ctx.error, ctx.arguments[1] as ProcedureOptions | undefined, shouldHandleError),
      );
    },
  });
}

function captureProcedureError(
  error: unknown,
  options: ProcedureOptions | undefined,
  shouldHandleError: ORPCShouldHandleError,
): void {
  if (!shouldHandleError(error)) {
    return;
  }

  withScope(scope => {
    scope.setContext('orpc', getProcedureContext(options));
    captureException(error, { mechanism: { type: ORPC_ORIGIN, handled: false } });
  });
}

// Event iterator procedures fail while the output is consumed, after the procedure call has resolved.
function captureAsyncIteratorErrors(
  output: unknown,
  options: ProcedureOptions | undefined,
  shouldHandleError: ORPCShouldHandleError,
): void {
  if (!isObjectLike(output) || typeof output.next !== 'function' || !(Symbol.asyncIterator in output)) {
    return;
  }

  const next = output.next as (...args: unknown[]) => Promise<unknown>;
  output.next = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    try {
      return await next.apply(this, args);
    } catch (error) {
      captureProcedureError(error, options, shouldHandleError);
      throw error;
    }
  };
}

function getProcedureContext(options: ProcedureOptions | undefined): Record<string, unknown> {
  const path = options?.path;
  const context: Record<string, unknown> = {
    procedure_path: Array.isArray(path) ? path.join('.') : undefined,
  };

  const client = getClient();
  if (client?.getDataCollectionOptions().httpBodies.includes('incomingRequest') && options?.input !== undefined) {
    context.input = normalize(options.input);
    setNormalizationDepthOverrideHint(context, 1 + (client.getOptions().normalizeDepth ?? 5));
  }

  return context;
}
