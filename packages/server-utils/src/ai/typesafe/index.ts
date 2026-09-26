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
} from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  stringify,
  withActiveSpan,
} from '@sentry/core';
import type { GenAiOptions } from '../core/utils';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { TYPESAFE_ORIGIN, TYPESAFE_PROVIDER_NAME } from './constants';

/**
 * Start the span for a `systemOne(request)` call. The request model falls back to the client's
 * `defaultModel`, the same way the SDK resolves it.
 */
export function startEvaluateSpan(request: unknown, client: unknown, recordInputs: boolean): Span {
  const params = isObjectLike(request) ? request : {};
  const defaultModel = isObjectLike(client) ? client.defaultModel : undefined;
  const model =
    typeof params.model === 'string' ? params.model : typeof defaultModel === 'string' ? defaultModel : undefined;

  return startInactiveSpan({
    name: model ? `evaluate ${model}` : 'evaluate',
    op: getGenAiSpanOp('evaluate'),
    attributes: getRequestAttributes(params, model, recordInputs),
  });
}

function getRequestAttributes(
  request: Record<string, unknown>,
  model: string | undefined,
  recordInputs: boolean,
): SpanAttributes {
  return {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: TYPESAFE_ORIGIN,
    [GEN_AI_OPERATION_NAME]: 'evaluate',
    [GEN_AI_PROVIDER_NAME]: TYPESAFE_PROVIDER_NAME,
    ...(model ? { [GEN_AI_REQUEST_MODEL]: model } : {}),
    ...(recordInputs
      ? {
          [GEN_AI_INPUT_MESSAGES]: stringify([
            { type: 'evaluation', state: request.state, questions: request.questions },
          ]),
        }
      : {}),
  };
}

/** Add the response model, token usage and (optionally) the answers of a `systemOne` result. */
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
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, stringify([{ type: 'evaluation', answers: result.answers }]));
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
export function instrumentTypeSafeClient<T extends object>(client: T, options?: GenAiOptions): T {
  return new Proxy(client, {
    get(target, prop) {
      // Read with the real client as receiver: the SDK keeps its API key in a private class field.
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (prop === 'systemOne') {
        return (...args: unknown[]) =>
          instrumentSystemOne(value as (...args: unknown[]) => unknown, target, args, options);
      }
      return value.bind(target);
    },
  });
}

function instrumentSystemOne(
  systemOne: (...args: unknown[]) => unknown,
  client: object,
  args: unknown[],
  options: GenAiOptions | undefined,
): unknown {
  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
  const span = startEvaluateSpan(args[0], client, recordInputs);
  const endWithError = (): void => {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    span.end();
  };

  let result: unknown;
  try {
    result = withActiveSpan(span, () => systemOne.apply(client, args));
  } catch (error) {
    endWithError();
    throw error;
  }

  const waiting = onSystemOneResponse(
    result,
    body => {
      addResponseAttributes(span, body, recordOutputs);
      span.end();
    },
    endWithError,
  );
  if (!waiting) {
    span.end();
  }

  return result;
}
