import type { SeverityLevel } from '@sentry/core';
import { captureException, isObjectLike } from '@sentry/core';
import * as Effect from 'effect';
import type * as Cause from 'effect/Cause';
import type * as EffectErrorReporter from 'effect/ErrorReporter';
import type * as EffectLayer from 'effect/Layer';
import { empty as emptyLayer } from 'effect/Layer';
import type * as LogLevel from 'effect/LogLevel';

// `effect/ErrorReporter` only exists in Effect v4, so it is read off the main entry instead of being imported
// as a subpath. On Effect v3 the lookup yields `undefined` and no reporter is registered.
const ErrorReporter = (Effect as Partial<typeof Effect>).ErrorReporter;

const SEVERITY_TO_LEVEL: Record<LogLevel.Severity, SeverityLevel> = {
  Fatal: 'fatal',
  Error: 'error',
  Warn: 'warning',
  Info: 'info',
  Debug: 'debug',
  Trace: 'debug',
};

function getLevel(errorReporter: typeof EffectErrorReporter, error: unknown): SeverityLevel {
  // Effect's `getSeverity` falls back to `Info` for unannotated errors, which would file plain failures as
  // informational in Sentry. Only an explicit annotation changes the level.
  if (isObjectLike(error) && errorReporter.severity in error) {
    return SEVERITY_TO_LEVEL[errorReporter.getSeverity(error)];
  }
  return 'error';
}

function makeSentryErrorReporter(errorReporter: typeof EffectErrorReporter): EffectErrorReporter.ErrorReporter {
  const reported = new WeakSet<object>();

  return {
    [errorReporter.TypeId]: errorReporter.TypeId,
    report({ cause }: { readonly cause: Cause.Cause<unknown> }): void {
      if (reported.has(cause)) {
        return;
      }
      reported.add(cause);

      for (const reason of cause.reasons) {
        if (reason._tag === 'Interrupt') {
          continue;
        }

        // The raw error is captured rather than Effect's pretty-printed copy so Sentry sees the original stack,
        // `cause` chain and error class.
        const error = reason._tag === 'Fail' ? reason.error : reason.defect;

        if (isObjectLike(error)) {
          if (reported.has(error)) {
            continue;
          }
          reported.add(error);
        }

        if (errorReporter.isIgnored(error)) {
          continue;
        }

        captureException(error, {
          mechanism: { type: 'auto.function.effect.error_reporter', handled: false },
          captureContext: {
            level: getLevel(errorReporter, error),
            extra: isObjectLike(error) ? { ...errorReporter.getAttributes(error) } : undefined,
          },
        });
      }
    },
  };
}

/**
 * Registers a Sentry `ErrorReporter` for `Effect.withErrorReporting`, `ErrorReporter.report` and the
 * built-in HTTP and RPC reporting boundaries. Existing reporters are kept.
 *
 * Effect v3 has no `ErrorReporter` API, so the returned layer is empty there.
 */
export function makeSentryErrorReporterLayer(): EffectLayer.Layer<never, never, never> {
  if (!ErrorReporter) {
    return emptyLayer;
  }

  return ErrorReporter.layer([makeSentryErrorReporter(ErrorReporter)], { mergeWithExisting: true });
}
