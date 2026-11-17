// Google's questions and answers already use Jev's layout, so only the evaluated input is renamed.
import { GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { isObjectLike } from '@sentry/core';
import { getEvaluationInputMessages, getEvaluationOutputMessages, getTokenUsageAttributes } from '../core/utils';

/**
 * Serialize a decisions request. Its evidence is `input` where Jev's is `state`; it is recorded as `state`
 * so both render the same.
 */
export function getDecisionInputMessages(params: Record<string, unknown>): string | undefined {
  return getEvaluationInputMessages({ state: params.input, questions: params.questions });
}

export function addDecisionResponseAttributes(span: Span, response: unknown, recordOutputs: boolean): void {
  if (!isObjectLike(response)) {
    return;
  }

  if (isObjectLike(response.usage)) {
    const usage = response.usage as Record<string, number | undefined>;
    span.setAttributes(
      getTokenUsageAttributes(
        usage.total_input_tokens,
        usage.total_output_tokens,
        undefined,
        usage.total_cached_tokens,
        usage.total_tokens,
      ),
    );
  }

  if (recordOutputs && response.answers !== undefined) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, getEvaluationOutputMessages(response.answers));
  }
}
