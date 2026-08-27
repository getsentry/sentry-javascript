import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  getClient,
  hasSpanStreamingEnabled,
  isObjectLike,
  SPAN_STATUS_ERROR,
  startSpan,
  startSpanManual,
} from '@sentry/core';
import type { Span } from '@sentry/core';
import { resolveAIRecordingOptions } from '../core/utils';
import { WORKERS_AI_INTEGRATION_NAME } from './constants';
import { instrumentWorkersAiStream } from './streaming';
import type { WorkersAiOptions } from './types';
import { addRequestAttributes, addResponseAttributes, extractRequestAttributes, getOperationName } from './utils';

// Adapted from /server-utils/src/vercel-ai/util.ts
// TODO(v11): Reuse this function once this gets moved to @sentry/server-utils
// Workers AI streaming responses are SSE byte streams, so we narrow to `Uint8Array`.
function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    isObjectLike(value) &&
    typeof (value as { pipeThrough?: unknown }).pipeThrough === 'function' &&
    typeof (value as { getReader?: unknown }).getReader === 'function'
  );
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
    // When another integration (e.g. Vercel AI via `workers-ai-provider`) is driving this binding,
    // it records the spans itself and marks this provider as skipped; skip here to avoid double spans.
    if (_INTERNAL_shouldSkipAiProviderWrapping(WORKERS_AI_INTEGRATION_NAME)) {
      return originalRun.apply(context, args);
    }

    const [model, inputs, runOptions] = args as [unknown, unknown, Record<string, unknown> | undefined];

    const operationName = getOperationName(inputs);
    const requestAttributes = extractRequestAttributes(model, inputs, operationName);
    const modelName = typeof model === 'string' && model ? model : 'unknown';
    const client = getClient();

    const isStreamRequested =
      !!inputs && typeof inputs === 'object' && (inputs as { stream?: unknown }).stream === true;
    const returnsRawResponse =
      !!runOptions &&
      typeof runOptions === 'object' &&
      (runOptions.returnRawResponse === true || runOptions.websocket === true);

    const spanConfig = {
      // With span streaming, omit the `'unknown'` model sentinel so the name stays low-cardinality.
      name:
        modelName !== 'unknown' || !(client && hasSpanStreamingEnabled(client))
          ? `${operationName} ${modelName}`
          : operationName,
      op: `gen_ai.${operationName}`,
      attributes: requestAttributes,
    };

    if (isStreamRequested && !returnsRawResponse) {
      return startSpanManual(spanConfig, (span: Span) => {
        // `startSpanManual` does not auto-end the span, so we must end it on every exit path,
        // including a synchronous throw from `run`.
        const handleError = (error: unknown): never => {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          span.end();
          throw error;
        };

        let originalResult: Promise<unknown>;

        try {
          originalResult = originalRun.apply(context, args) as Promise<unknown>;
        } catch (error) {
          return handleError(error);
        }

        if (options.recordInputs) {
          addRequestAttributes(span, inputs, operationName);
        }

        return originalResult.then(result => {
          if (isReadableStream(result)) {
            return instrumentWorkersAiStream(result, span, options.recordOutputs);
          }

          // The model did not actually return a stream — finalize the span eagerly.
          addResponseAttributes(span, result, options.recordOutputs);
          span.end();
          return result;
        }, handleError);
      });
    }

    return startSpan(spanConfig, (span: Span) => {
      const originalResult = originalRun.apply(context, args) as Promise<unknown>;

      if (options.recordInputs) {
        addRequestAttributes(span, inputs, operationName);
      }

      return originalResult.then(result => {
        if (!returnsRawResponse) {
          addResponseAttributes(span, result, options.recordOutputs);
        }
        return result;
      });
    });
  };
}

/**
 * Instrument a Cloudflare Workers AI binding (`env.AI`) with Sentry tracing.
 *
 * This wraps the binding's `run` method to create `gen_ai` spans following the
 * Sentry AI Agents conventions. All other methods are passed through untouched.
 *
 * In `@sentry/cloudflare`, the `env.AI` binding is instrumented automatically —
 * wrapping manually is only needed to pass custom options.
 *
 * @example
 * ```javascript
 * const ai = Sentry.instrumentWorkersAiClient(env.AI, { recordInputs: true, recordOutputs: true });
 * const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });
 * ```
 */
export function instrumentWorkersAiClient<T extends object>(client: T, options?: WorkersAiOptions): T {
  const resolvedOptions = resolveAIRecordingOptions(options);

  const instrumented = new Proxy(client, {
    get(target: object, prop: string | symbol, receiver: unknown): unknown {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'run' && typeof value === 'function') {
        return instrumentRun(value as (...args: unknown[]) => Promise<unknown>, target, resolvedOptions);
      }

      // Bind passed-through functions to the original target to preserve `this` (e.g. private fields).
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as T;

  return instrumented;
}
