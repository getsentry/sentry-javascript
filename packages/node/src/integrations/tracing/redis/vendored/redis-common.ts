/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.62.0/packages/redis-common
 * - Upstream version: @opentelemetry/redis-common@0.38.2
 * - Minor TypeScript adjustments for this repository's compiler settings
 */
/* eslint-disable -- vendored @opentelemetry/redis-common */

/**
 * List of regexes and the number of arguments that should be serialized for matching commands.
 * For example, HSET should serialize which key and field it's operating on, but not its value.
 * Setting the subset to -1 will serialize all arguments.
 * Commands without a match will have their first argument serialized.
 *
 * Refer to https://redis.io/commands/ for the full list.
 */
const serializationSubsets = [
  {
    regex: /^ECHO/i,
    args: 0,
  },
  {
    regex: /^(LPUSH|MSET|PFA|PUBLISH|RPUSH|SADD|SET|SPUBLISH|XADD|ZADD)/i,
    args: 1,
  },
  {
    regex: /^(HSET|HMSET|LSET|LINSERT)/i,
    args: 2,
  },
  {
    regex:
      /^(ACL|BIT|B[LRZ]|CLIENT|CLUSTER|CONFIG|COMMAND|DECR|DEL|EVAL|EX|FUNCTION|GEO|GET|HINCR|HMGET|HSCAN|INCR|L[TRLM]|MEMORY|P[EFISTU]|RPOP|S[CDIMORSU]|XACK|X[CDGILPRT]|Z[CDILMPRS])/i,
    args: -1,
  },
];

/**
 * Given the redis command name and arguments, return a combination of the
 * command name + the allowed arguments according to `serializationSubsets`.
 */
export const defaultDbStatementSerializer = (
  cmdName: string,
  cmdArgs: Array<string | Buffer | number | any[]>,
): string => {
  if (Array.isArray(cmdArgs) && cmdArgs.length) {
    const nArgsToSerialize = serializationSubsets.find(({ regex }) => regex.test(cmdName))?.args ?? 0;
    const argsToSerialize: Array<string | Buffer | number | any[]> =
      nArgsToSerialize >= 0 ? cmdArgs.slice(0, nArgsToSerialize) : cmdArgs.slice();
    if (cmdArgs.length > argsToSerialize.length) {
      argsToSerialize.push(`[${cmdArgs.length - nArgsToSerialize} other arguments]`);
    }
    return `${cmdName} ${argsToSerialize.join(' ')}`;
  }
  return cmdName;
};
