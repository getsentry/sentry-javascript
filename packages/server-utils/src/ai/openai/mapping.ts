/**
 * Maps OpenAI decisions requests and responses to the format Jev calls are recorded in, so Sentry renders
 * both the same way.
 */
import { isObjectLike } from '@sentry/core';
import { getEvaluationInputMessages, getEvaluationOutputMessages } from '../core/utils';

/**
 * Serialize a decisions request. Its evidence is `input` where Jev's is `state`; it is recorded as `state`
 * so both render the same.
 */
export function getDecisionInputMessages(params: Record<string, unknown>): string | undefined {
  const questions = Array.isArray(params.questions) ? params.questions.map(toJevQuestionFormat) : params.questions;
  return getEvaluationInputMessages({ state: params.input, questions: keyByName(questions) });
}

/** Serialize the answers of a decisions response, laid out and keyed like Jev answers. */
export function getDecisionOutputMessages(answers: unknown[]): string | undefined {
  return getEvaluationOutputMessages(keyByName(answers.map(toJevAnswerFormat)));
}

/**
 * Lay out a decisions question like a Jev question, with its options in `criteria`: choices as
 * `{ [value]: description }` (an empty description when there is none), and score levels as their labels,
 * indexed by score value, with any level descriptions in `descriptions`, keyed by score value.
 */
function toJevQuestionFormat(question: unknown): unknown {
  if (!isObjectLike(question)) {
    return question;
  }

  if (question.type === 'choice' && Array.isArray(question.choices)) {
    const { choices, ...rest } = question;
    const criteria = Object.fromEntries(
      choices
        .filter(isObjectLike)
        .map(choice => [String(choice.value), typeof choice.description === 'string' ? choice.description : '']),
    );
    return { ...rest, criteria };
  }

  if (question.type === 'score' && Array.isArray(question.levels)) {
    const { levels, ...rest } = question;
    const criteria = levels.map(level => (isObjectLike(level) ? level.label : level));
    // Sentry renders score criteria as a list of labels only, so level descriptions go in their own field,
    // keyed by score value like an answer's `legend`.
    const descriptions = Object.fromEntries(
      levels.flatMap((level, index) =>
        isObjectLike(level) && typeof level.description === 'string' ? [[String(index), level.description]] : [],
      ),
    );
    return Object.keys(descriptions).length ? { ...rest, criteria, descriptions } : { ...rest, criteria };
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
    // Choice values can be booleans, but Sentry renders a choice as a string, like its `probabilities` keys.
    return { ...answer, choice: String(answer.choice), probabilities };
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
