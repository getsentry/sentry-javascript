import { FAAS_NAME, FAAS_TRIGGER, SENTRY_KIND } from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import {
  captureException,
  flush,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  startSpanManual,
} from '@sentry/core';

const FUNCTIONS_ORIGIN = 'auto.firebase.functions';

// Set on a wrapped handler so re-entrant `start` events don't double-wrap it.
const WRAPPED = '__sentryFirebaseWrapped';

type Handler = (this: unknown, ...args: unknown[]) => unknown;

interface FunctionsChannelContext {
  // The live args of the `onX(...)` registration call. firebase-functions accepts either
  // `onX(handler)` or `onX(documentOrOptions, handler)`, so the handler is `arguments[0]` when it's a
  // function, otherwise `arguments[1]`. Mutating the entry here swaps in the wrapped handler.
  arguments: unknown[];
  self?: unknown;
}

/**
 * Rewrap the handler argument of a firebase-functions `onX(...)` registration so the returned cloud
 * function opens a `SERVER` span (and error boundary) each time it's invoked. Runs as the tracing
 * channel's `start` subscriber, before orchestrion forwards the (mutated) arguments to the real call.
 *
 * The registration call itself is trivial and synchronous, so — unlike the firestore path — this does
 * not bind a span to the channel; it only uses the channel as an injection point.
 */
export function wrapFunctionsRegistration(data: FunctionsChannelContext, triggerType: string): void {
  const args = data.arguments;
  if (!Array.isArray(args) || args.length === 0) {
    return;
  }

  const handlerIndex = typeof args[0] === 'function' ? 0 : 1;
  const handler = args[handlerIndex];

  if (typeof handler !== 'function' || (handler as unknown as Record<string, unknown>)[WRAPPED]) {
    return;
  }

  args[handlerIndex] = wrapHandler(handler as Handler, triggerType);
}

function wrapHandler(handler: Handler, triggerType: string): Handler {
  const wrapped = async function (this: unknown, ...handlerArgs: unknown[]): Promise<unknown> {
    const functionName = process.env.FUNCTION_TARGET || process.env.K_SERVICE || 'unknown';

    const attributes: SpanAttributes = {
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: FUNCTIONS_ORIGIN,
      [FAAS_NAME]: functionName,
      [FAAS_TRIGGER]: triggerType,
      'faas.provider': 'firebase',
      [SENTRY_KIND]: 'server',
    };

    if (process.env.GCLOUD_PROJECT) {
      attributes['cloud.project_id'] = process.env.GCLOUD_PROJECT;
    }

    if (process.env.EVENTARC_CLOUD_EVENT_SOURCE) {
      attributes['cloud.event_source'] = process.env.EVENTARC_CLOUD_EVENT_SOURCE;
    }

    // `startSpanManual` keeps the span active while still allowing us to end it before flushing on error.
    return startSpanManual(
      {
        name: `firebase.function.${triggerType}`,
        op: 'function.firebase',
        attributes: {
          ...attributes,
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        },
      },
      async span => {
        try {
          const result = await handler.apply(this, handlerArgs);
          span.end();
          return result;
        } catch (error) {
          span.setStatus({ code: SPAN_STATUS_ERROR });
          captureException(error, {
            mechanism: {
              type: FUNCTIONS_ORIGIN,
              handled: false,
            },
          });
          span.end();
          await flush(2000);
          throw error;
        }
      },
    );
  };

  (wrapped as unknown as Record<string, unknown>)[WRAPPED] = true;
  return wrapped;
}
