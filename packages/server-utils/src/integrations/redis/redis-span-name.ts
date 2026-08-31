import { DB_STORED_PROCEDURE_NAME } from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { getClient, hasSpanStreamingEnabled } from '@sentry/core';

const DB_SYSTEM_VALUE_REDIS = 'redis';

// `FCALL`/`FCALL_RO` invoke a redis function by name as their first argument. Redis functions are
// the one construct the conventions' db naming templates can model for redis — everything else a
// command touches is a key, which is exactly the high cardinality the streamed name has to avoid.
const STORED_PROCEDURE_COMMANDS = ['fcall', 'fcall_ro'];

// The connection a command was sent over. Untyped values because call sites read them off a client,
// a diagnostics_channel payload or an already-built span attribute bag.
interface RedisConnection {
  host?: unknown;
  port?: unknown;
}

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

// The template needs both halves, so a client configured with only a port has no target.
function getServerTarget({ host, port }: RedisConnection): string | undefined {
  const hasPort = typeof port === 'number' || (typeof port === 'string' && !!port);
  return typeof host === 'string' && host && hasPort ? `${host}:${port}` : undefined;
}

/**
 * The conventions attributes that name a redis command span, and the name itself when span
 * streaming is enabled (`undefined` otherwise, leaving the caller's existing name in place).
 *
 * `db.query.text` carries the key and its arguments, so it cannot name a streamed span. Redis has
 * no collection to pair the operation with, so the name is
 * `{db.operation.name} {server.address}:{server.port}`, falling back to `{db.system.name}` when the
 * client was configured without a host. `FCALL` names a redis function, which the conventions model
 * as a stored procedure and rank ahead of the connection.
 *
 * `db.namespace` is deliberately not a target: for redis it is the numeric database index, which
 * says nothing about what the command did.
 */
export function getRedisQueryNaming(
  command: string,
  args: ReadonlyArray<unknown>,
  connection: RedisConnection,
): { streamedName: string | undefined; attributes: SpanAttributes } {
  const storedProcedure = getStoredProcedureName(command, args);
  const target = storedProcedure || getServerTarget(connection);
  const name = command && target ? `${command} ${target}` : target || DB_SYSTEM_VALUE_REDIS;
  const client = getClient();

  return {
    streamedName: client && hasSpanStreamingEnabled(client) ? name : undefined,
    attributes: storedProcedure ? { [DB_STORED_PROCEDURE_NAME]: storedProcedure } : {},
  };
}
