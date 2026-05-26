/*
 * Adapted from @opentelemetry/redis-common (Apache-2.0):
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.62.0/packages/redis-common
 *
 * Sentry note: the upstream package targets the OTel ecosystem; we own this
 * portable, dependency-free copy so the redis diagnostics-channel subscriber
 * in core can serialize `db.statement` attributes without importing any
 * runtime-specific code.
 *
 * @module
 */

/**
 * Per-command argument-serialization budgets. `args: -1` means "serialize
 * everything"; any other value caps how many leading args appear in the
 * `db.statement` attribute. Commands without a match serialize just the
 * command name.
 *
 * See https://redis.io/commands/ for the full surface.
 */
const SERIALIZATION_SUBSETS: Array<{ regex: RegExp; args: number }> = [
  { regex: /^ECHO/i, args: 0 },
  { regex: /^(LPUSH|MSET|PFA|PUBLISH|RPUSH|SADD|SET|SPUBLISH|XADD|ZADD)/i, args: 1 },
  { regex: /^(HSET|HMSET|LSET|LINSERT)/i, args: 2 },
  {
    regex:
      /^(ACL|BIT|B[LRZ]|CLIENT|CLUSTER|CONFIG|COMMAND|DECR|DEL|EVAL|EX|FUNCTION|GEO|GET|HINCR|HMGET|HSCAN|INCR|L[TRLM]|MEMORY|P[EFISTU]|RPOP|S[CDIMORSU]|XACK|X[CDGILPRT]|Z[CDILMPRS])/i,
    args: -1,
  },
];

/**
 * Returns a redis `db.statement` string composed of the command name and the
 * allow-listed prefix of arguments. Values that exceed the budget are elided
 * with a "[N other arguments]" placeholder so secrets don't leak into spans.
 */
export function defaultDbStatementSerializer(
  cmdName: string,
  cmdArgs: Array<string | Uint8Array | number | unknown[]>,
): string {
  if (!Array.isArray(cmdArgs) || cmdArgs.length === 0) return cmdName;

  const utf8Decoder = new TextDecoder('utf-8');

  const budget = SERIALIZATION_SUBSETS.find(({ regex }) => regex.test(cmdName))?.args ?? 0;
  const argsToSerialize: Array<string | number | unknown[]> = (
    budget >= 0 ? cmdArgs.slice(0, budget) : cmdArgs.slice()
  ).map(a => (a instanceof Uint8Array ? utf8Decoder.decode(a) : a));
  if (cmdArgs.length > argsToSerialize.length) {
    argsToSerialize.push(`[${cmdArgs.length - budget} other arguments]`);
  }
  return `${cmdName} ${argsToSerialize.join(' ')}`;
}
