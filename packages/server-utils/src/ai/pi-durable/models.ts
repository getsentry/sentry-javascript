import { isThenable, SPAN_STATUS_ERROR, startSpanManual } from '@sentry/core';
import type { GenAiOptions } from '../core/utils';
import { resolveAIRecordingOptions } from '../core/utils';
import { getPiAiChatSpanOptions, setPiAiResponseAttributes } from '../pi-ai/chat';
import type { PiAiContext } from '../pi-ai/messages';
import type { PiAssistantMessage, PiEventStream, PiModel, PiStreamOptions } from '../pi-ai/types';
import { PI_DURABLE_ORIGIN } from './constants';
import type { PiModels } from './types';

type ModelCall = (model: PiModel, request: unknown, options?: unknown) => unknown;

const STREAMING_METHODS = new Set(['stream', 'streamSimple', 'streamDeferred']);
const COMPLETE_METHODS = new Set(['complete', 'completeSimple', 'fetchDeferred']);
// These fetch the answer of a parked request; their second argument is a handle, not the request.
const DEFERRED_METHODS = new Set(['streamDeferred', 'fetchDeferred']);

/**
 * Wrap a pi-ai `Models` so every model request it sends gets a `gen_ai.chat` span.
 *
 * The proxy hands every other member through bound to the original, so a `Models` instance whose
 * methods read `this` keeps working, and the caller's own object is never modified.
 */
export function instrumentPiModels<T extends PiModels>(models: T, options: GenAiOptions, onRequest: () => void): T {
  const wrapped = new Map<PropertyKey, unknown>();

  return new Proxy(models, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') {
        return value;
      }

      const cached = wrapped.get(property);
      if (cached) {
        return cached;
      }

      const original = (value as ModelCall).bind(target);
      const method = String(property);
      const streaming = STREAMING_METHODS.has(method);
      const deferred = DEFERRED_METHODS.has(method);
      const instrumented =
        streaming || COMPLETE_METHODS.has(method)
          ? (model: PiModel, request: unknown, callOptions?: unknown): unknown => {
              onRequest();
              return traceModelRequest(
                model,
                deferred ? undefined : (request as PiAiContext),
                deferred ? undefined : (callOptions as PiStreamOptions | undefined),
                streaming,
                options,
                () => original(model, request, callOptions),
              );
            }
          : original;

      wrapped.set(property, instrumented);
      return instrumented;
    },
  });
}

function traceModelRequest(
  model: PiModel,
  context: PiAiContext | undefined,
  callOptions: PiStreamOptions | undefined,
  streaming: boolean,
  options: GenAiOptions,
  send: () => unknown,
): unknown {
  // Read per request: `dataCollection.genAI` belongs to the current client, which can change.
  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);

  return startSpanManual(
    getPiAiChatSpanOptions({ model, context, callOptions, streaming, origin: PI_DURABLE_ORIGIN, recordInputs }),
    span => {
      let result: unknown;
      try {
        result = send();
      } catch (error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
        span.end();
        throw error;
      }

      // pi-ai never rejects a request: a provider failure or an abort settles as a message with
      // `stopReason` `error` or `aborted`. The rejection handler only covers a broken provider.
      let settled: unknown;
      try {
        settled = streaming ? (result as PiEventStream).result() : result;
      } catch {
        settled = undefined;
      }
      // A result of another shape must reach the caller unchanged, so its span ends without a response.
      if (!isThenable(settled)) {
        span.end();
        return result;
      }
      (settled as Promise<PiAssistantMessage>).then(
        message => {
          setPiAiResponseAttributes(span, message, recordOutputs);
          span.end();
        },
        () => {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
          span.end();
        },
      );

      return result;
    },
  );
}
