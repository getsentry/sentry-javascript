// Google's questions and answers already use Jev's layout, so only the evaluated input is mapped.
import { GEN_AI_OUTPUT_MESSAGES } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { isObjectLike } from '@sentry/core';
import { getEvaluationInputMessages, getEvaluationOutputMessages, getTokenUsageAttributes } from '../core/utils';
import type { GenAiMessage, GenAiMessagePart } from '../types';

/**
 * Serialize a decisions request. Its evidence is `input` where Jev's is `state`; it is recorded as `state`
 * so both render the same.
 */
export function getDecisionInputMessages(params: Record<string, unknown>): string | undefined {
  return getEvaluationInputMessages({ state: toStateMessages(params.input), questions: params.questions });
}

/**
 * Multimodal evidence is one part or a list of parts, recorded as one user message so it renders like OpenAI's.
 * Inline media is reported by modality and media type only: its `data` is base64, which the conventions require
 * to be dropped.
 */
function toStateMessages(input: unknown): unknown {
  if (typeof input === 'string') {
    return input;
  }

  const parts = (Array.isArray(input) ? input : [input]).filter(isObjectLike).map((part): GenAiMessagePart => {
    if (part.type === 'text') {
      return { type: 'text', content: part.text };
    }
    if (typeof part.uri === 'string') {
      return { type: 'uri', modality: part.type, mime_type: part.mime_type, uri: part.uri };
    }
    return { type: 'blob', modality: part.type, mime_type: part.mime_type };
  });
  return [{ role: 'user', parts } satisfies GenAiMessage];
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
