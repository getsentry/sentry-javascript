import { DB_STORED_PROCEDURE_NAME } from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { getClient, hasSpanStreamingEnabled } from '@sentry/core';

const DB_SYSTEM_VALUE_REDIS = 'redis';

// `FCALL`/`FCALL_RO` invoke a redis function by name as their first argument. Redis functions are
// the one construct the conventions' db naming templates can model for redis — everything else a
// command touches is a key, which is exactly the high cardinality the streamed name has to avoid.
const STORED_PROCEDURE_COMMANDS = ['fcall', 'fcall_ro'];

function getStoredProcedureName(command: string, args: ReadonlyArray<unknown>): string | undefined {
  if (!STORED_PROCEDURE_COMMANDS.includes(command.toLowerCase())) {
    return undefined;
  }
  const raw = args[0];
  const name = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString() : undefined;
  // node-redis and ioredis redact arguments before publishing them on their channels. A redacted
  // function name says nothing, so leave the attribute unset rather than emit `FCALL ?`.
  return name && name !== '?' ? name : undefined;
}

/**
 * The conventions attributes that name a redis command span, and the name itself when span
 * streaming is enabled (`undefined` otherwise, leaving the caller's existing name in place).
 *
 * `db.query.text` carries the key and its arguments, so it cannot name a streamed span. Redis has
 * nothing to pair the operation with, so the name is the bare `{db.operation.name}` — matching the
 * span name OTel prescribes for redis. `FCALL` additionally names the function it calls.
 */
export function getRedisQueryNaming(
  command: string,
  args: ReadonlyArray<unknown>,
): { streamedName: string | undefined; attributes: SpanAttributes } {
  const storedProcedure = getStoredProcedureName(command, args);
  const name = storedProcedure ? `${command} ${storedProcedure}` : command;
  const client = getClient();

  return {
    streamedName: client && hasSpanStreamingEnabled(client) ? name || DB_SYSTEM_VALUE_REDIS : undefined,
    attributes: storedProcedure ? { [DB_STORED_PROCEDURE_NAME]: storedProcedure } : {},
  };
}
