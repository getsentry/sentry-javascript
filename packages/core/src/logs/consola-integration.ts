import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { IntegrationFn } from '../types-hoist/integration';
import { isPrimitive } from '../utils/is';
import { logger } from '../utils/logger';
import { normalize } from '../utils/normalize';
import { _INTERNAL_captureLog } from './exports';

interface ConsolaIntegrationOptions {
  /**
   * Consola instances to add the Sentry reporter to.
   * These should be existing consola instances from the user's application.
   */
  consola: ConsolaLike | ConsolaLike[];
}

/**
 * Minimal interface for consola-like objects to avoid adding consola as a dependency.
 * Users should pass their actual consola instances.
 */
interface ConsolaLike {
  addReporter: (reporter: ConsolaReporter) => void;
  removeReporter: (reporter: ConsolaReporter) => void;
}

interface ConsolaReporter {
  log: (logObj: ConsolaLogObject, ctx: { options: any }) => void;
}

interface ConsolaLogObject {
  [key: string]: unknown;
  level: number;
  type: string;
  tag?: string;
  args: any[];
  date: Date;
  message?: string;
  additional?: string | string[];
}

const INTEGRATION_NAME = 'ConsolaLogs';

const DEFAULT_ATTRIBUTES = {
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.consola.logging',
};

/**
 * Map consola log types to Sentry log levels
 */
const CONSOLA_TYPE_TO_SENTRY_LEVEL: Record<string, string> = {
  silent: 'debug',
  fatal: 'fatal',
  error: 'error',
  warn: 'warning',
  info: 'info',
  debug: 'debug',
  trace: 'debug',
  log: 'info',
  verbose: 'debug',
  start: 'info',
  success: 'info',
  fail: 'error',
  ready: 'info',
};

/**
 * Map consola log levels (numeric) to Sentry levels
 */
function getLogLevelFromNumeric(level: number): string {
  if (level <= 0) return 'error'; // Fatal/Error
  if (level === 1) return 'warning'; // Warnings
  if (level === 2) return 'info'; // Normal logs
  if (level === 3) return 'info'; // Informational logs
  if (level >= 4) return 'debug'; // Debug/Trace logs
  return 'info';
}

const _consolaLoggingIntegration = ((options: ConsolaIntegrationOptions) => {
  const consolaInstances = Array.isArray(options.consola) ? options.consola : [options.consola];

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const { _experiments, normalizeDepth = 3, normalizeMaxBreadth = 1_000 } = client.getOptions();
      if (!_experiments?.enableLogs) {
        DEBUG_BUILD && logger.warn('`_experiments.enableLogs` is not enabled, ConsolaLogs integration disabled');
        return;
      }

      // Create the Sentry reporter
      const sentryReporter: ConsolaReporter = {
        log: (logObj: ConsolaLogObject) => {
          if (getClient() !== client) {
            return;
          }

          // Determine Sentry log level
          const sentryLevel = CONSOLA_TYPE_TO_SENTRY_LEVEL[logObj.type] || getLogLevelFromNumeric(logObj.level);

          // Format the message from consola log object
          let message = '';
          const args = [...logObj.args];

          // Handle message property
          if (logObj.message) {
            message = String(logObj.message);
          }

          // Handle additional property
          if (logObj.additional) {
            const additionalText = Array.isArray(logObj.additional)
              ? logObj.additional.join('\n')
              : String(logObj.additional);
            if (message) {
              message += `\n${additionalText}`;
            } else {
              message = additionalText;
            }
          }

          // If no message from properties, format args
          if (!message && args.length > 0) {
            message = formatConsolaArgs(args, normalizeDepth, normalizeMaxBreadth);
          }

          // Build attributes
          const attributes: Record<string, string> = { ...DEFAULT_ATTRIBUTES };
          if (logObj.tag) {
            attributes['consola.tag'] = logObj.tag;
          }

          _INTERNAL_captureLog({
            level: sentryLevel as any,
            message,
            attributes,
          });
        },
      };

      // Add the reporter to all consola instances
      consolaInstances.forEach(consola => {
        try {
          consola.addReporter(sentryReporter);
        } catch (error) {
          DEBUG_BUILD && logger.warn('Failed to add Sentry reporter to consola instance:', error);
        }
      });

      // Store reference to remove on cleanup if needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (client as any).__consolaReporter = sentryReporter;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (client as any).__consolaInstances = consolaInstances;
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures logs from consola instances by adding a Sentry reporter. Requires `_experiments.enableLogs` to be enabled.
 *
 * @experimental This feature is experimental and may be changed or removed in future versions.
 *
 * This integration works by adding a custom reporter to your existing consola instances.
 * The reporter will forward all logs to Sentry while preserving the original consola behavior.
 *
 * @example
 *
 * ```ts
 * import * as Sentry from '@sentry/browser';
 * import { consola } from 'consola';
 *
 * Sentry.init({
 *   integrations: [Sentry.consolaLoggingIntegration({ consola })],
 * });
 *
 * // Now all consola logs will be sent to Sentry
 * consola.info('This will be captured by Sentry');
 * consola.error('This error will also be captured');
 * ```
 */
export const consolaLoggingIntegration = defineIntegration(_consolaLoggingIntegration);

function formatConsolaArgs(values: unknown[], normalizeDepth: number, normalizeMaxBreadth: number): string {
  return values
    .map(value =>
      isPrimitive(value) ? String(value) : JSON.stringify(normalize(value, normalizeDepth, normalizeMaxBreadth)),
    )
    .join(' ');
}
