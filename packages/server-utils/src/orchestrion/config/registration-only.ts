import type { InstrumentationConfig } from '..';

/**
 * Build a registration-only config for one file of a library.
 *
 * `functionQuery` takes the same shapes as a normal config (`functionName`,
 * `expressionName`, or `className` + `methodName`); the `kind` is fixed.
 */
export function registrationOnly(
  module: { name: string; versionRange: string; filePath: string },
  functionQuery: { functionName?: string; expressionName?: string; className?: string; methodName?: string },
): InstrumentationConfig {
  return {
    channelName: 'moduleLoaded',
    module,
    functionQuery: { ...functionQuery, kind: 'Sync' },
  } as InstrumentationConfig;
}
