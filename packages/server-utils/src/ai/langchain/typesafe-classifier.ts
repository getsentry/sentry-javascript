import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { isObjectLike } from '@sentry/core';
import { addResponseAttributes, startEvaluateSpan } from '../typesafe';
import { LANGCHAIN_ORIGIN } from './constants';
import { getAgentNameFromMetadata, getConversationIdFromMetadata } from './utils';

// `TypeSafeClassifier` from `@langchain/typesafe` calls Jev with `fetch`, not through `@typesafe-ai/sdk`,
// so the TypeSafe integration does not see it. Its serialized id is `[...lc_namespace, lc_name()]`.
const TYPESAFE_CLASSIFIER_ID = 'langchain/classifiers/typesafe/TypeSafeClassifier';

/** The package's default, used when the classifier is constructed without a `model`. */
const DEFAULT_TYPESAFE_CLASSIFIER_MODEL = 'jev-latest';

// The `state` the classifier sends to Jev (messages rendered as transcript lines), keyed by the input
// passed to `invoke()`. LangChain hands that same object to `handleChainStart`, so the span records what
// Jev received rather than LangChain's serialized messages.
const wireStates = new WeakMap<object, unknown>();

/** Record the `state` a `TypeSafeClassifier` sends for `input`, using the classifier's own serializer. */
export function recordTypeSafeClassifierState(classifier: unknown, input: unknown): void {
  // A string state is sent as is, so there is nothing to record.
  if (!isObjectLike(input) || !isObjectLike(classifier) || typeof classifier.payload !== 'function') {
    return;
  }

  try {
    const body: unknown = JSON.parse(classifier.payload(input));
    if (isObjectLike(body)) {
      wireStates.set(input, body.state);
    }
  } catch {
    // The classifier rejects the same input itself; the span keeps LangChain's form of it.
  }
}

// Typed loosely: LangChain's `Serialized` union does not match our handler's chain type.
export function isTypeSafeClassifier(chain: unknown): boolean {
  return isObjectLike(chain) && Array.isArray(chain.id) && chain.id.join('/') === TYPESAFE_CLASSIFIER_ID;
}

/** Start an `evaluate` span for a `TypeSafeClassifier` run, from its serialized constructor arguments. */
export function startTypeSafeClassifierSpan(
  chain: unknown,
  inputs: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
  recordInputs: boolean,
): Span {
  const kwargs = isObjectLike(chain) && isObjectLike(chain.kwargs) ? chain.kwargs : {};
  const model = typeof kwargs.model === 'string' ? kwargs.model : DEFAULT_TYPESAFE_CLASSIFIER_MODEL;

  return startEvaluateSpan({ model, state: getState(inputs), questions: kwargs.questions }, undefined, recordInputs, {
    [SENTRY_ORIGIN]: LANGCHAIN_ORIGIN,
    ...getAgentNameFromMetadata(metadata),
    ...getConversationIdFromMetadata(metadata),
  });
}

/** The classifier result reports usage in camelCase, the TypeSafe helpers read the API's snake_case. */
export function addTypeSafeClassifierResponseAttributes(span: Span, outputs: unknown, recordOutputs: boolean): void {
  if (!isObjectLike(outputs)) {
    return;
  }

  const usage = isObjectLike(outputs.usage) ? outputs.usage : {};
  addResponseAttributes(
    span,
    {
      model: outputs.model,
      answers: outputs.answers,
      usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
    },
    recordOutputs,
  );
}

function getState(inputs: Record<string, unknown>): unknown {
  // LangChain hands a string or array input to callbacks wrapped as `{ input }`.
  const keys = Object.keys(inputs);
  const input = inputs.input;
  const state =
    keys.length === 1 && keys[0] === 'input' && (typeof input === 'string' || Array.isArray(input)) ? input : inputs;

  return isObjectLike(state) && wireStates.has(state) ? wireStates.get(state) : state;
}
