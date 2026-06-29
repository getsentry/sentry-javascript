import { captureException } from '../../exports';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpan, startSpanManual } from '../../tracing/trace';
import type { Span } from '../../types/span';
import { resolveAIRecordingOptions, shouldEnableTruncation } from '../ai/utils';
import { WORKERS_AI_ORIGIN } from './constants';
import { instrumentWorkersAiStream } from './streaming';
import type { WorkersAiOptions } from './types';
import { addRequestAttributes, addResponseAttributes, extractRequestAttributes, getOperationName } from './utils';

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && value instanceof ReadableStream;
}

/**
 * Wrap the `run` method of the Workers AI binding with Sentry tracing.
 */
function instrumentRun(
  originalRun: (...args: unknown[]) => Promise<unknown>,
  context: unknown,
  options: WorkersAiOptions & Required<Pick<WorkersAiOptions, 'recordInputs' | 'recordOutputs'>>,
): (...args: unknown[]) => Promise<unknown> {
  return function instrumentedRun(...args: unknown[]): Promise<unknown> {
    const [model, inputs, runOptions] = args as [unknown, unknown, Record<string, unknown> | undefined];

    const operationName = getOperationName(inputs);
    const requestAttributes = extractRequestAttributes(model, inputs, operationName);
    const modelName = typeof model === 'string' ? model : 'unknown';

    const isStreamRequested =
      !!inputs && typeof inputs === 'object' && (inputs as { stream?: unknown }).stream === true;
    const returnsRawResponse =
      !!runOptions &&
      typeof runOptions === 'object' &&
      (runOptions.returnRawResponse === true || runOptions.websocket === true);

    const spanConfig = {
      name: `${operationName} ${modelName}`,
      op: `gen_ai.${operationName}`,
      attributes: requestAttributes,
    };

    if (isStreamRequested && !returnsRawResponse) {
      return startSpanManual(spanConfig, (span: Span) => {
        const originalResult = originalRun.apply(context, args) as Promise<unknown>;

        if (options.recordInputs) {
          addRequestAttributes(span, inputs, operationName, shouldEnableTruncation(options.enableTruncation));
        }

        return originalResult.then(
          result => {
            if (isReadableStream(result)) {
              return instrumentWorkersAiStream(result, span, options.recordOutputs);
            }

            // The model did not actually return a stream — finalize the span eagerly.
            addResponseAttributes(span, result, options.recordOutputs);
            span.end();
            return result;
          },
          error => {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: { handled: false, type: `${WORKERS_AI_ORIGIN}.stream`, data: { function: 'run' } },
            });
            span.end();
            throw error;
          },
        );
      });
    }

    return startSpan(spanConfig, (span: Span) => {
      const originalResult = originalRun.apply(context, args) as Promise<unknown>;

      if (options.recordInputs) {
        addRequestAttributes(span, inputs, operationName, shouldEnableTruncation(options.enableTruncation));
      }

      return originalResult.then(
        result => {
          if (!returnsRawResponse) {
            addResponseAttributes(span, result, options.recordOutputs);
          }
          return result;
        },
        error => {
          captureException(error, {
            mechanism: { handled: false, type: WORKERS_AI_ORIGIN, data: { function: 'run' } },
          });
          throw error;
        },
      );
    });
  };
}

/**
 * Instrument a Cloudflare Workers AI binding (`env.AI`) with Sentry tracing.
 *
 * This wraps the binding's `run` method to create `gen_ai` spans following the
 * Sentry AI Agents conventions. All other methods are passed through untouched.
 *
 * @example
 * ```javascript
 * const ai = Sentry.instrumentWorkersAiClient(env.AI);
 * const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });
 * ```
 */
export function instrumentWorkersAiClient<T extends object>(client: T, options?: WorkersAiOptions): T {
  const resolvedOptions = resolveAIRecordingOptions(options);

  return new Proxy(client, {
    get(target: object, prop: string | symbol, receiver: unknown): unknown {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'run' && typeof value === 'function') {
        return instrumentRun(value as (...args: unknown[]) => Promise<unknown>, target, resolvedOptions);
      }

      // Bind passed-through functions to the original target to preserve `this` (e.g. private fields).
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as T;
}
