import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
import type { Span, SpanAttributes } from '@sentry/core';
import { isObjectLike, SPAN_STATUS_ERROR, startInactiveSpan, withActiveSpan } from '@sentry/core';
import type { GenAiSpanHooks } from '../core/span-hooks';
import { runGenAiSpanEnd, runGenAiSpanStart } from '../core/span-hooks';
import type { GenAiCallOptions } from '../core/utils';
import { getEvaluationInputMessages, getEvaluationOutputMessages, resolveGenAiCallRecording } from '../core/utils';
import { TYPESAFE_ORIGIN, TYPESAFE_PROVIDER_NAME } from './constants';

/** The call that `recordInputs`/`recordOutputs` decide on, and that the span hooks get. */
export interface TypeSafeCallInfo {
  /** The request, the first argument of `systemOne` as passed. */
  request: unknown;
}

/** Options for the TypeSafe integration. `onSpanEnd` gets the parsed `systemOne` result. */
export type TypeSafeOptions = GenAiCallOptions<TypeSafeCallInfo> & GenAiSpanHooks<TypeSafeCallInfo>;

/**
 * Start the span for a `systemOne(request)` call. The request model falls back to the client's
 * `defaultModel`, the same way the SDK resolves it.
 */
export function startDecideSpan(
  request: unknown,
  client: unknown,
  recordInputs: boolean,
  attributes?: SpanAttributes,
): Span {
  const params = isObjectLike(request) ? request : {};
  const defaultModel = isObjectLike(client) ? client.defaultModel : undefined;
  const model =
    typeof params.model === 'string' ? params.model : typeof defaultModel === 'string' ? defaultModel : undefined;

  return startInactiveSpan({
    name: model ? `decide ${model}` : 'decide',
    // oxlint-disable-next-line typescript/no-deprecated -- the rename to `gen_ai.decide` comes in a follow-up
    op: GEN_AI_DECIDE,
    // Extra attributes (e.g. another integration's origin) are set at start, so samplers see them.
    attributes: { ...getRequestAttributes(params, model, recordInputs), ...attributes },
  });
}

function getRequestAttributes(
  request: Record<string, unknown>,
  model: string | undefined,
  recordInputs: boolean,
): SpanAttributes {
  return {
    [SENTRY_ORIGIN]: TYPESAFE_ORIGIN,
    [GEN_AI_OPERATION_NAME]: 'decide',
    [GEN_AI_PROVIDER_NAME]: TYPESAFE_PROVIDER_NAME,
    [GEN_AI_REQUEST_MODEL]: model,
    ...(recordInputs ? { [GEN_AI_INPUT_MESSAGES]: getEvaluationInputMessages(request) } : {}),
  };
}

/**
 * Add the response model, token usage and (optionally) the answers of a `systemOne` result.
 * Also used for TypeSafe models on Workers AI.
 */
export function addResponseAttributes(span: Span, result: unknown, recordOutputs: boolean): void {
  if (!isObjectLike(result)) {
    return;
  }

  if (typeof result.model === 'string') {
    span.setAttribute(GEN_AI_RESPONSE_MODEL, result.model);
  }

  const usage = isObjectLike(result.usage) ? result.usage : undefined;
  const inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : undefined;
  const outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : undefined;
  if (inputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
  }
  if (outputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
  }
  if (inputTokens !== undefined && outputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_TOTAL_TOKENS, inputTokens + outputTokens);
  }

  if (recordOutputs && result.answers !== undefined) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, getEvaluationOutputMessages(result.answers));
  }
}

/**
 * `systemOne` returns a lazy `APIPromise` before the request settles, and parses the body on the first
 * `.then()`. Wait on `asResponse()` (the raw fetch, which does not parse the body) and read a clone of
 * the body, so the caller's own parse is unaffected. Call this before the caller can await the result,
 * so the clone is taken first. Returns `false` when `result` is not an `APIPromise`.
 */
export function onSystemOneResponse(
  result: unknown,
  onBody: (body: unknown) => void,
  onError: (error: unknown) => void,
): boolean {
  if (!isObjectLike(result) || typeof result.asResponse !== 'function') {
    return false;
  }

  (result.asResponse() as Promise<Response>).then(
    response =>
      response
        .clone()
        .json()
        .then(
          body => onBody(body),
          () => onBody(undefined),
        ),
    error => onError(error),
  );

  return true;
}

/**
 * Instrument a TypeSafe client (`@typesafe-ai/sdk`) with Sentry tracing.
 */
export function instrumentTypeSafeClient<T extends object>(client: T, options?: TypeSafeOptions): T {
  return new Proxy(client, {
    get(target, prop) {
      // Read with the real client as receiver: the SDK keeps its API key in a private class field.
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (prop === 'systemOne') {
        return (...args: unknown[]) =>
          instrumentSystemOne(value as (...args: unknown[]) => unknown, target, args, options ?? {});
      }
      return value.bind(target);
    },
  });
}

function instrumentSystemOne(
  systemOne: (...args: unknown[]) => unknown,
  client: object,
  args: unknown[],
  options: TypeSafeOptions,
): unknown {
  const call: TypeSafeCallInfo = { request: args[0] };
  const { recordInputs, recordOutputs } = resolveGenAiCallRecording(options, call);
  const span = startDecideSpan(args[0], client, recordInputs);
  runGenAiSpanStart(options, span, call);
  const endWithError = (error: unknown): void => {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    runGenAiSpanEnd(options, span, call, { error });
    span.end();
  };

  let result: unknown;
  try {
    result = withActiveSpan(span, () => systemOne.apply(client, args));
  } catch (error) {
    endWithError(error);
    throw error;
  }

  const waiting = onSystemOneResponse(
    result,
    body => {
      addResponseAttributes(span, body, recordOutputs);
      runGenAiSpanEnd(options, span, call, { response: body });
      span.end();
    },
    endWithError,
  );
  if (!waiting) {
    runGenAiSpanEnd(options, span, call, { response: result });
    span.end();
  }

  return result;
}
