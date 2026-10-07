import { GEN_AI_INPUT_MESSAGES, GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import { isObjectLike } from '@sentry/core';
import { resolveAIRecordingOptions } from '../ai/core/utils';
import type { GenAiOptions } from '../ai/core/utils';
import type { ClassifierEvaluationCall } from '../ai/mastra/classifier-evaluation';
import { setStartingClassifierEvaluation } from '../ai/mastra/classifier-evaluation';
import { getEvaluationInputMessages, getEvaluationOutputMessages } from '../ai/typesafe';
import { CHANNELS } from '../orchestrion/channels';
import { safeChannelCallback } from '../tracing-channel';
import * as diagnosticsChannel from '../utils/diagnosticsChannel';

interface ClassifierEvaluateChannelContext {
  // `evaluate({ state, questions? })`; `self` is the `Classifier`.
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
}

/**
 * Add the evaluated state, questions and answers of a `Classifier.evaluate()` call to the exporter's
 * `classifier_evaluation` span, which Mastra leaves without input or output.
 */
export function recordClassifierEvaluations(options: GenAiOptions): void {
  const channel = diagnosticsChannel.tracingChannel<ClassifierEvaluateChannelContext>(
    CHANNELS.MASTRA_CLASSIFIER_EVALUATE,
  );
  const calls = new WeakMap<object, ClassifierEvaluationCall>();

  channel.start.subscribe(message => {
    safeChannelCallback(() => {
      const call: ClassifierEvaluationCall = {};
      calls.set(message as object, call);
      setStartingClassifierEvaluation(call);
    });
  });
  // `evaluate()` has reached its first `await`, so Mastra has already started its span.
  channel.end.subscribe(() => {
    safeChannelCallback(() => setStartingClassifierEvaluation(undefined));
  });
  channel.asyncEnd.subscribe(message => {
    safeChannelCallback(() => {
      const call = calls.get(message as object);
      if (call) {
        finishClassifierEvaluation(call, message as ClassifierEvaluateChannelContext, options);
      }
    });
  });
}

function finishClassifierEvaluation(
  call: ClassifierEvaluationCall,
  message: ClassifierEvaluateChannelContext,
  options: GenAiOptions,
): void {
  call.settled = true;
  const { span } = call;
  if (!span) {
    return;
  }

  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
  if (recordInputs) {
    const params = isObjectLike(message.arguments[0]) ? message.arguments[0] : {};
    // Questions given to the constructor take precedence over the ones passed to `evaluate()`, as in Mastra.
    const questions = (isObjectLike(message.self) ? message.self.questions : undefined) ?? params.questions;
    span.setAttribute(GEN_AI_INPUT_MESSAGES, getEvaluationInputMessages({ state: params.state, questions }));
  }
  if (recordOutputs && isObjectLike(message.result)) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, getEvaluationOutputMessages(message.result.answers));
  }

  if (call.endTime) {
    span.end(call.endTime);
  }
}
