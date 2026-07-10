import { getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Event } from '../types/event';
import type { Experiment } from '../types/experiment';
import { debug } from './debug-logger';
import { getActiveSpan, spanToJSON } from './spanUtils';

export const _INTERNAL_EXPERIMENT_BUFFER_SIZE = 100;

export const _INTERNAL_MAX_EXPERIMENTS_PER_SPAN = 10;

const SPAN_EXPERIMENT_ATTRIBUTE_PREFIX = 'experiment.evaluation.';

export function _INTERNAL_copyExperimentsFromScopeToEvent(event: Event): Event {
  if (event.type) {
    // No need to add the experiment context to transaction events.
    // Spans already get the experiment.evaluation attributes.
    return event;
  }

  const scope = getCurrentScope();
  const experimentContext = scope.getScopeData().contexts.experiments;
  const experimentBuffer = experimentContext ? experimentContext.values : [];

  if (!experimentBuffer.length) {
    return event;
  }

  if (event.contexts === undefined) {
    event.contexts = {};
  }
  event.contexts.experiments = { values: [...experimentBuffer] };
  return event;
}

/**
 * Inserts an experiment into the current scope's context while maintaining ordered LRU properties.
 * Not thread-safe. After inserting:
 * - The experiment buffer is sorted in order of recency, with the newest evaluation at the end.
 * - The names in the buffer are always unique.
 * - The length of the buffer never exceeds `maxSize`.
 *
 * @param name      Name of the experiment to insert.
 * @param gropuName Group name of the experiment.
 * @param maxSize   Max number of experiments the buffer should store. Default value should always be used in production.
 */
export function _INTERNAL_insertExperimentsToScope(
  name: string,
  groupName: unknown,
  maxSize: number = _INTERNAL_EXPERIMENT_BUFFER_SIZE,
): void {
  const scopeContexts = getCurrentScope().getScopeData().contexts;
  if (!scopeContexts.experiments) {
    scopeContexts.experiments = { values: [] };
  }
  const experiments = scopeContexts.experiments.values;
  _INTERNAL_insertToExperimentBuffer(experiments, name, groupName, maxSize);
}

/**
 * Exported for tests only. Currently only accepts string values (otherwise no-op).
 * Inserts an experiment into an Experiment array while maintaining the following properties:
 * - Experiments are sorted in order of recency, with the newest evaluation at the end.
 * - The experiment names are always unique.
 * - The length of the array never exceeds `maxSize`.
 *
 * @param experiments The buffer to insert the experiment into.
 * @param name        Name of the experiment to insert.
 * @param groupName   Group name chosen for this experiment.
 * @param maxSize     Max number of experiments the buffer should store. Default value should always be used in production.
 */
export function _INTERNAL_insertToExperimentBuffer(
  experiments: Experiment[],
  name: string,
  groupName: unknown,
  maxSize: number,
): void {
  if (typeof groupName !== 'string') {
    return;
  }

  if (experiments.length > maxSize) {
    DEBUG_BUILD &&
      debug.error(`[Experiments] insertToExperimentBuffer called on a buffer larger than maxSize=${maxSize}`);
    return;
  }

  // Check if the experiment is already in the buffer - O(n)
  const index = experiments.findIndex(f => f.experiment === name);

  if (index !== -1) {
    // The experiment was found, remove it from its current position - O(n)
    experiments.splice(index, 1);
  }

  if (experiments.length === maxSize) {
    // If at capacity, pop the earliest experiment - O(n)
    experiments.shift();
  }

  // Push the experiment to the end - O(1)
  experiments.push({
    experiment: name,
    groupName,
  });
}

/**
 * Records an experiment evaluation for the active span. This is a no-op for non-string values.
 * The experiment and its value is stored in span attributes with the `experiment.evaluation` prefix. Once the
 * unique experiments for a span reaches maxExperimentsPerSpan, subsequent experiments are dropped.
 *
 * @param name                   Name of the experiment.
 * @param groupName              Group name of the experiment. Non-string values are ignored.
 * @param maxExperimentsPerSpan  Max number of experiments a buffer should store. Default value should always be used in production.
 */
export function _INTERNAL_addExperimentToActiveSpan(
  name: string,
  groupName: unknown,
  maxExperimentsPerSpan: number = _INTERNAL_MAX_EXPERIMENTS_PER_SPAN,
): void {
  if (typeof groupName !== 'string') {
    return;
  }

  const span = getActiveSpan();
  if (!span) {
    return;
  }

  const attributes = spanToJSON(span).data;

  // If the experiment already exists, always update it
  if (`${SPAN_EXPERIMENT_ATTRIBUTE_PREFIX}${name}` in attributes) {
    span.setAttribute(`${SPAN_EXPERIMENT_ATTRIBUTE_PREFIX}${name}`, groupName);
    return;
  }

  // Else, add the experiment to the span if we have not reached the max number of experiments.
  const numOfAddedExperiments = Object.keys(attributes).filter(key =>
    key.startsWith(SPAN_EXPERIMENT_ATTRIBUTE_PREFIX),
  ).length;
  if (numOfAddedExperiments < maxExperimentsPerSpan) {
    span.setAttribute(`${SPAN_EXPERIMENT_ATTRIBUTE_PREFIX}${name}`, groupName);
  }
}
