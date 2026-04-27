import { getTraceData, type SerializedTraceData } from '@sentry/core';

/**
 * Key used to identify Sentry RPC metadata in a trailing argument.
 * This enables transparent trace propagation across Cloudflare Workers RPC
 * calls (Cap'n Proto), which have no native header/metadata support.
 */
const SENTRY_RPC_META_KEY = '__sentry_rpc_meta__';

interface SentryRpcMeta {
  __sentry_rpc_meta__: SerializedTraceData;
}

function isSentryRpcMeta(value: unknown): value is SentryRpcMeta {
  if (typeof value !== 'object' || value === null || !(SENTRY_RPC_META_KEY in value)) {
    return false;
  }
  const sentry = (value as SentryRpcMeta).__sentry_rpc_meta__;
  return typeof sentry === 'object' && sentry !== null;
}

/**
 * Appends Sentry RPC metadata to an args array for trace propagation.
 * If no active trace exists, returns the original args unchanged.
 */
export function appendRpcMeta(args: unknown[]): unknown[] {
  const traceData = getTraceData();

  if (!traceData['sentry-trace']) {
    return args;
  }

  return [...args, { [SENTRY_RPC_META_KEY]: traceData }];
}

/**
 * Extracts Sentry RPC metadata from the trailing argument of an args array.
 * Returns cleaned args (without meta) and the extracted trace data if found.
 */
export function extractRpcMeta<T extends unknown[]>(
  args: T,
): {
  args: T;
  rpcMeta?: SerializedTraceData;
} {
  if (args.length === 0) {
    return { args };
  }

  const last = args[args.length - 1];
  if (isSentryRpcMeta(last)) {
    return {
      args: args.slice(0, -1) as T,
      rpcMeta: last.__sentry_rpc_meta__,
    };
  }

  return { args };
}
