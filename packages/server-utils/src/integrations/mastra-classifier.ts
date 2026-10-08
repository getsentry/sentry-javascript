import { GEN_AI_INPUT_MESSAGES, GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import { isObjectLike } from '@sentry/core';
import type { ClassifierEvaluationCall } from '../ai/mastra/classifier-evaluation';
import { processClassifierEvaluationData, setStartingClassifierEvaluation } from '../ai/mastra/classifier-evaluation';
import { getEvaluationInputMessages, getEvaluationOutputMessages } from '../ai/core/utils';
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
export function recordClassifierEvaluations(): void {
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
        finishClassifierEvaluation(call, message as ClassifierEvaluateChannelContext);
      }
    });
  });
}

function finishClassifierEvaluation(call: ClassifierEvaluationCall, message: ClassifierEvaluateChannelContext): void {
  call.settled = true;
  const { span, recordInputs, recordOutputs } = call;
  if (!span) {
    return;
  }

  const params = isObjectLike(message.arguments[0]) ? message.arguments[0] : {};
  // Questions given to the constructor take precedence over the ones passed to `evaluate()`, as in Mastra.
  const questions = (isObjectLike(message.self) ? message.self.questions : undefined) ?? params.questions;
  const data = processClassifierEvaluationData(call, {
    input: recordInputs ? { state: params.state, questions } : undefined,
    output: recordOutputs && isObjectLike(message.result) ? message.result.answers : undefined,
  });

  if (isObjectLike(data?.input)) {
    span.setAttribute(GEN_AI_INPUT_MESSAGES, getEvaluationInputMessages(data.input));
  }
  if (data?.output !== undefined) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, getEvaluationOutputMessages(data.output));
  }

  if (call.endTime) {
    span.end(call.endTime);
  }
}
