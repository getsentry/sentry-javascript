import type { IntegrationFn } from '@sentry/core';
import { captureException, defineIntegration, getCurrentScope, startSpan, withScope } from '@sentry/core';
import type { EffectExit, EffectModule, EffectSpan, EffectTracer } from './types';

const INTEGRATION_NAME = 'Effect';

// Global state to track if tracing is enabled
let isInstrumentationEnabled = false;
let originalTracer: EffectTracer | undefined;

/**
 * Instruments Effect spans to create Sentry spans.
 */
export const instrumentEffect = Object.assign(
  (): void => {
    if (isInstrumentationEnabled) {
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Effect = require('effect') as EffectModule;

      if (!Effect?.Tracer) {
        return;
      }

      // Store the original tracer if it exists
      originalTracer = Effect.Tracer.get?.() || Effect.Tracer.current?.() || undefined;

      // Create our custom tracer that wraps operations in Sentry spans
      const sentryTracer: EffectTracer = {
        onSpanStart(span: EffectSpan) {
          // Hook for span start - can be used for additional instrumentation
          if (originalTracer?.onSpanStart) {
            originalTracer.onSpanStart(span);
          }
        },

        onSpanEnd(span: EffectSpan, exit: EffectExit) {
          // Hook for span end - handle failures
          if (exit._tag === 'Failure' && exit.cause) {
            withScope(scope => {
              scope.setTag('effect.exit_tag', exit._tag);
              scope.setContext('effect.span', {
                name: span.name,
                startTime: Number(span.startTime),
                endTime: span.endTime ? Number(span.endTime) : undefined,
              });
              captureException(exit.cause);
            });
          }

          if (originalTracer?.onSpanEnd) {
            originalTracer.onSpanEnd(span, exit);
          }
        },

        span<A>(name: string, f: () => A): A {
          return startSpan(
            {
              name,
              op: 'effect.span',
              origin: 'auto.effect',
            },
            () => {
              try {
                return f();
              } catch (error) {
                const scope = getCurrentScope();
                scope.setTag('effect.error', true);
                captureException(error);
                throw error;
              }
            },
          );
        },

        withSpan<A>(span: EffectSpan, f: () => A): A {
          return startSpan(
            {
              name: span.name,
              op: 'effect.span',
              origin: 'auto.effect',
              startTime: Number(span.startTime) / 1000000, // Convert nanoseconds to milliseconds
              data: span.attributes,
            },
            sentrySpan => {
              try {
                const result = f();

                // Set status based on span status
                if (span.status && span.status.code !== 0) {
                  sentrySpan.setStatus('internal_error');
                  if (span.status.message) {
                    sentrySpan.setData('effect.status_message', span.status.message);
                  }
                }

                return result;
              } catch (error) {
                sentrySpan.setStatus('internal_error');
                const scope = getCurrentScope();
                scope.setTag('effect.error', true);
                captureException(error);
                throw error;
              }
            },
          );
        },
      };

      // Register our tracer with Effect
      if (typeof Effect.Tracer.set === 'function') {
        Effect.Tracer.set(sentryTracer);
      } else if (typeof Effect.Tracer.register === 'function') {
        Effect.Tracer.register(sentryTracer);
      } else if (typeof Effect.Tracer.use === 'function') {
        Effect.Tracer.use(sentryTracer);
      } else {
        return;
      }

      isInstrumentationEnabled = true;
    } catch (error) {
      // Silent failure - Effect may not be available
    }
  },
  { id: INTEGRATION_NAME },
);

const _effectIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentEffect();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Effect](https://effect.website/).
 *
 * This integration automatically traces Effect spans and captures errors that occur
 * within Effect computations as Sentry exceptions with proper context.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.effectIntegration()],
 * });
 * ```
 */
export const effectIntegration = defineIntegration(_effectIntegration);
