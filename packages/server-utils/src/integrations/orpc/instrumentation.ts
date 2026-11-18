import * as diagnosticsChannel from '../../utils/diagnosticsChannel';
import { RPC_METHOD, RPC_SYSTEM_NAME, SENTRY_OP, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HTTP_SERVER, RPC } from '@sentry/conventions/op';
import {
  captureException,
  getActiveSpan,
  getClient,
  getIsolationScope,
  getRootSpan,
  INTERNAL_setSegmentNameSourceIfSegment,
  isObjectLike,
  normalize,
  setNormalizationDepthOverrideHint,
  spanToJSON,
  startInactiveSpan,
  updateSpanName,
  withScope,
} from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import type { OrchestrionChannelContext } from '../../orchestrion/types';
import { bindTracingChannelToSpan, safeChannelCallback } from '../../tracing-channel';

const ORPC_ORIGIN = 'auto.rpc.orpc';

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
 * Traces oRPC procedure calls and captures the errors they throw.
 *
 * `executeProcedureInternal` runs the middleware chain and the handler of one procedure call and rejects
 * with the original error, before oRPC encodes it into an error response that no HTTP error handler sees.
 */
export function instrumentORPC(shouldHandleError: ORPCShouldHandleError): void {
  const { channel } = bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.ORPC_EXECUTE_PROCEDURE),
    data => startProcedureSpan(getProcedureOptions(data)),
  );

  channel.subscribe({
    asyncEnd(data) {
      safeChannelCallback(() => {
        if (data.error === undefined) {
          captureAsyncIteratorErrors(data.result, getProcedureOptions(data), shouldHandleError);
        }
      });
    },
    error(data) {
      safeChannelCallback(() => captureProcedureError(data.error, getProcedureOptions(data), shouldHandleError));
    },
  });
}

function getProcedureOptions(data: OrchestrionChannelContext): ProcedureOptions | undefined {
  return data.arguments[1] as ProcedureOptions | undefined;
}

function getProcedurePath(options: ProcedureOptions | undefined): string | undefined {
  const path = options?.path;
  return Array.isArray(path) && path.length > 0 ? path.join('/') : undefined;
}

function startProcedureSpan(options: ProcedureOptions | undefined): ReturnType<typeof startInactiveSpan> {
  const path = getProcedurePath(options);
  const name = path ?? 'orpc procedure';

  // The request URL is not a good transaction name: OpenAPI routes contain path params.
  const activeSpan = getActiveSpan();
  if (path && activeSpan) {
    const rootSpan = getRootSpan(activeSpan);
    if (spanToJSON(rootSpan).attributes[SENTRY_OP] === HTTP_SERVER) {
      updateSpanName(rootSpan, path);
      INTERNAL_setSegmentNameSourceIfSegment(rootSpan, 'route');
      getIsolationScope().setTransactionName(path);
    }
  }

  return startInactiveSpan({
    name,
    attributes: {
      [SENTRY_OP]: RPC,
      [SENTRY_ORIGIN]: ORPC_ORIGIN,
      [RPC_SYSTEM_NAME]: 'orpc',
      ...(path && { [RPC_METHOD]: path }),
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
  const context: Record<string, unknown> = {
    procedure_path: getProcedurePath(options),
  };

  const client = getClient();
  if (client?.getDataCollectionOptions().httpBodies.includes('incomingRequest') && options?.input !== undefined) {
    context.input = normalize(options.input);
    setNormalizationDepthOverrideHint(context, 1 + (client.getOptions().normalizeDepth ?? 5));
  }

  return context;
}
