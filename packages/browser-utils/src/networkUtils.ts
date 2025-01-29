import type { ConsoleLevel, Logger } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { NetworkMetaWarning } from './types';

type ReplayConsoleLevels = Extract<ConsoleLevel, 'info' | 'warn' | 'error' | 'log'>;
type LoggerMethod = (...args: unknown[]) => void;
type LoggerConsoleMethods = Record<ReplayConsoleLevels, LoggerMethod>;

interface LoggerConfig {
  captureExceptions: boolean;
  traceInternals: boolean;
}

// Duplicate from replay-internal
interface ReplayLogger extends LoggerConsoleMethods {
  /**
   * Calls `logger.info` but saves breadcrumb in the next tick due to race
   * conditions before replay is initialized.
   */
  infoTick: LoggerMethod;
  /**
   * Captures exceptions (`Error`) if "capture internal exceptions" is enabled
   */
  exception: LoggerMethod;
  /**
   * Configures the logger with additional debugging behavior
   */
  setConfig(config: Partial<LoggerConfig>): void;
}

function _serializeFormData(formData: FormData): string {
  // This is a bit simplified, but gives us a decent estimate
  // This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'
  // @ts-expect-error passing FormData to URLSearchParams actually works
  return new URLSearchParams(formData).toString();
}

/** Get the string representation of a body. */
export function getBodyString(
  body: unknown,
  logger?: Logger | ReplayLogger,
): [string | undefined, NetworkMetaWarning?] {
  try {
    if (typeof body === 'string') {
      return [body];
    }

    if (body instanceof URLSearchParams) {
      return [body.toString()];
    }

    if (body instanceof FormData) {
      return [_serializeFormData(body)];
    }

    if (!body) {
      return [undefined];
    }
  } catch (error) {
    // RelayLogger
    if (DEBUG_BUILD && logger && 'exception' in logger) {
      logger.exception(error, 'Failed to serialize body', body);
    } else if (DEBUG_BUILD && logger) {
      logger.error(error, 'Failed to serialize body', body);
    }
    return [undefined, 'BODY_PARSE_ERROR'];
  }

  DEBUG_BUILD && logger?.info('Skipping network body because of body type', body);

  return [undefined, 'UNPARSEABLE_BODY_TYPE'];
}

/**
 * Parses the fetch arguments to extract the request payload.
 * We only support getting the body from the fetch options.
 */
export function getFetchRequestArgBody(fetchArgs: unknown[] = []): RequestInit['body'] | undefined {
  if (fetchArgs.length !== 2 || typeof fetchArgs[1] !== 'object') {
    return undefined;
  }

  return (fetchArgs[1] as RequestInit).body;
}
