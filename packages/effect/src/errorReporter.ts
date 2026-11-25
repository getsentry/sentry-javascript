import type { SeverityLevel } from '@sentry/core';
import { captureException, isObjectLike } from '@sentry/core';
import type * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type * as EffectErrorReporter from 'effect/ErrorReporter';
import * as Layer from 'effect/Layer';
import { contextExports, isEffectV4 } from './compat';

// `effect/ErrorReporter` only exists in Effect v4. Importing it fails Effect v3 builds, and reading it off the
// `effect` main entry bundles all of Effect, so the reporter uses the string keys of that API. The types make a
// changed key fail type checking.
const TYPE_ID: EffectErrorReporter.TypeId = '~effect/ErrorReporter';
const IGNORE: EffectErrorReporter.ignore = '~effect/ErrorReporter/ignore';
const SEVERITY: EffectErrorReporter.severity = '~effect/ErrorReporter/severity';
const ATTRIBUTES: EffectErrorReporter.attributes = '~effect/ErrorReporter/attributes';

/**
 * Reference to the reporters that Effect calls for a reported failure. Effect looks up references by key, so it
 * resolves to the same entry as `ErrorReporter.CurrentErrorReporters`. `undefined` on Effect v3.
 */
const CurrentErrorReporters = isEffectV4
  ? contextExports.Reference<ReadonlySet<EffectErrorReporter.ErrorReporter>>(
      'effect/ErrorReporter/CurrentErrorReporters',
      { defaultValue: () => new Set() },
    )
  : undefined;

// Only an explicit severity annotation changes the level. Effect's own `getSeverity` falls back to `Info`, which
// would file plain failures as informational in Sentry.
const SEVERITY_TO_LEVEL = new Map<unknown, SeverityLevel>([
  ['Fatal', 'fatal'],
  ['Error', 'error'],
  ['Warn', 'warning'],
  ['Info', 'info'],
  ['Debug', 'debug'],
  ['Trace', 'debug'],
]);

const reported = new WeakSet<object>();

/**
 * One instance for every Sentry layer, so the reporters set holds it once even when the layer is provided twice.
 */
const sentryErrorReporter: EffectErrorReporter.ErrorReporter = {
  [TYPE_ID]: TYPE_ID,
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
        if (reported.has(error) || error[IGNORE] === true) {
          continue;
        }
        reported.add(error);
      }

      captureException(error, {
        mechanism: { type: 'auto.function.effect.error_reporter', handled: false },
        captureContext: {
          level: (isObjectLike(error) && SEVERITY_TO_LEVEL.get(error[SEVERITY])) || 'error',
          extra: isObjectLike(error) ? { ...(error[ATTRIBUTES] as Record<string, unknown> | undefined) } : undefined,
        },
      });
    }
  },
};

/**
 * Registers a Sentry `ErrorReporter` for `Effect.withErrorReporting`, `ErrorReporter.report` and the
 * built-in HTTP and RPC reporting boundaries. Existing reporters are kept.
 *
 * Effect v3 has no `ErrorReporter` API, so the returned layer is empty there.
 */
export function makeSentryErrorReporterLayer(): Layer.Layer<never> {
  if (!CurrentErrorReporters) {
    return Layer.empty;
  }

  return Layer.effect(
    CurrentErrorReporters,
    Effect.gen(function* () {
      const reporters = new Set(yield* CurrentErrorReporters);
      reporters.add(sentryErrorReporter);
      return reporters;
    }),
  );
}
