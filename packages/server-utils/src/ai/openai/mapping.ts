/**
 * Maps OpenAI decisions requests and responses to the format Jev calls are recorded in, so Sentry renders
 * both the same way.
 */
import { isObjectLike } from '@sentry/core';
import { getEvaluationInputMessages, getEvaluationOutputMessages } from '../core/utils';

/**
 * Serialize a decisions request. Its evidence is `input` where Jev's is `state`; it is recorded as `state`
 * so both render the same. Images are base64 data URLs, so they are reported by media type only.
 */
export function getDecisionInputMessages(params: Record<string, unknown>): string | undefined {
  const questions = Array.isArray(params.questions) ? params.questions.map(toJevQuestionFormat) : params.questions;
  return getEvaluationInputMessages({ state: withoutImageData(params.input), questions: keyByName(questions) });
}

/** Serialize the answers of a decisions response, laid out and keyed like Jev answers. */
export function getDecisionOutputMessages(answers: unknown[]): string | undefined {
  return getEvaluationOutputMessages(keyByName(answers.map(toJevAnswerFormat)));
}

/**
 * Lay out a decisions question like a Jev question, with its options in `criteria`: choices as
 * `{ [value]: description }` (undescribed choices are left out), and score levels as their labels,
 * indexed by score value.
 */
function toJevQuestionFormat(question: unknown): unknown {
  if (!isObjectLike(question)) {
    return question;
  }

  if (question.type === 'choice' && Array.isArray(question.choices)) {
    const { choices, ...rest } = question;
    const described = choices.filter(
      (choice): choice is Record<string, unknown> => isObjectLike(choice) && typeof choice.description === 'string',
    );
    return described.length
      ? { ...rest, criteria: Object.fromEntries(described.map(choice => [String(choice.value), choice.description])) }
      : rest;
  }

  if (question.type === 'score' && Array.isArray(question.levels)) {
    const { levels, ...rest } = question;
    return { ...rest, criteria: levels.map(level => (isObjectLike(level) ? level.label : level)) };
  }

  return question;
}

/**
 * Lay out choice and score answers like Jev answers: probabilities keyed by option or score value, with
 * score labels in a `legend`. Predicate answers are already in the shape Sentry renders.
 */
function toJevAnswerFormat(answer: unknown): unknown {
  if (
    !isObjectLike(answer) ||
    (answer.type !== 'choice' && answer.type !== 'score') ||
    !Array.isArray(answer.probabilities)
  ) {
    return answer;
  }

  const options = answer.probabilities.filter(isObjectLike);
  const probabilities = Object.fromEntries(options.map(option => [String(option.value), option.probability]));
  if (answer.type === 'choice') {
    return { ...answer, probabilities };
  }

  const legend = Object.fromEntries(
    options.filter(option => typeof option.label === 'string').map(option => [String(option.value), option.label]),
  );
  return { ...answer, probabilities, legend };
}

/**
 * The decisions API lists questions and answers as arrays with an optional `name`, where the conventions
 * key them by question name. An unnamed item is keyed by its position.
 */
function keyByName(items: unknown): unknown {
  if (!Array.isArray(items)) {
    return items;
  }

  return Object.fromEntries(
    items.map((item, index) => {
      if (!isObjectLike(item)) {
        return [String(index), item];
      }
      const { name, ...rest } = item;
      return [typeof name === 'string' ? name : String(index), rest];
    }),
  );
}

function withoutImageData(input: unknown): unknown {
  if (!Array.isArray(input)) {
    return input;
  }

  // Parts are also handled at the top level, in case a flat list of parts is passed instead of messages.
  return input.map(item =>
    isObjectLike(item) && Array.isArray(item.content)
      ? { ...item, content: item.content.map(withoutImageDataPart) }
      : withoutImageDataPart(item),
  );
}

function withoutImageDataPart(part: unknown): unknown {
  if (!isObjectLike(part) || part.type !== 'input_image' || typeof part.image_url !== 'string') {
    return part;
  }

  const mimeType = /^data:([^;,]+)/.exec(part.image_url)?.[1];
  return mimeType ? { type: 'input_image', mime_type: mimeType } : { type: 'input_image' };
}
