import type { Scope } from '@sentry/core';
import {
  addNonEnumerableProperty,
  captureException,
  getCurrentScope,
  getDefaultIsolationScope,
  SPAN_STATUS_ERROR,
  startNewTrace,
  withActiveSpan,
} from '@sentry/core';
import type { GenAiOptions } from '../core/utils';
import { skipPiAiProviderIntegrations } from '../pi-ai/providers';
import { PI_DURABLE_ORIGIN, PI_TASK } from './constants';
import { instrumentPiModels } from './models';
import type { PiRuns } from './runs';
import { createRuns, endRun, observeRunControl, startRun, toSentryConversationId } from './runs';
import { instrumentTool, instrumentToolPhase } from './tools';
import type {
  PiHarness,
  PiHarnessOptions,
  PiPhaseHandler,
  PiRegistryReader,
  PiRegistrySnapshot,
  PiTask,
  PiTaskRuntime,
  PiTool,
} from './types';
import { bound, withCleanScopes } from './utils';

export type PiDurableOptions = GenAiOptions;

const INSTRUMENTED = Symbol.for('sentry.pi-durable.instrumented');
const RUNS = Symbol.for('sentry.pi-durable.runs');

/**
 * Return pi-durable `HarnessOptions` whose model requests, task phases and tool calls are traced.
 * The caller's `models` and `registry` objects are wrapped, never modified. The result has the
 * caller's options as prototype: pi-durable reads `settings`, `env` and `conversationCreated` at
 * every use, so they stay live, getters included.
 *
 * Spans:
 * - `gen_ai.invoke_agent` for each run, a new trace per run, or a child of the tool call that
 *   created the conversation for a subagent;
 * - `gen_ai.chat` for each model request, under its run;
 * - `gen_ai.execute_tool` for each tool call, under its run.
 *
 * The scheduler starts task phases from whichever async context last woke it, often an unrelated
 * request. Every phase therefore runs in its run's own scopes and trace, never in the ones it
 * inherits.
 */
export function instrumentPiDurableHarnessOptions<T extends PiHarnessOptions>(
  harnessOptions: T,
  options: PiDurableOptions = {},
): T {
  if (!harnessOptions || (harnessOptions as Record<symbol, unknown>)[INSTRUMENTED]) {
    return harnessOptions;
  }

  const runs = createRuns();
  const own = (value: unknown): PropertyDescriptor => ({ value, enumerable: true, configurable: true, writable: true });
  const instrumented: T = Object.create(harnessOptions, {
    ...(harnessOptions.models
      ? { models: own(instrumentPiModels(harnessOptions.models, options, skipPiAiProviderIntegrations)) }
      : {}),
    ...(harnessOptions.registry ? { registry: own(instrumentRegistry(harnessOptions.registry, options, runs)) } : {}),
    // pi-durable passes failures of extension code here, such as a throwing hook, and keeps going.
    onReport: own((error: unknown) => {
      captureException(error, { mechanism: { handled: true, type: PI_DURABLE_ORIGIN } });
      harnessOptions.onReport?.(error);
    }),
  });
  addNonEnumerableProperty(instrumented, INSTRUMENTED, true);
  addNonEnumerableProperty(instrumented, RUNS, runs);
  return instrumented;
}

/**
 * End the open runs of `harness` when it closes. Closing stops the scheduler without settling the
 * inputs in flight, so nothing else would end their `invoke_agent` spans. A run whose ending commit
 * is still in flight ends with that commit's status.
 */
export function endRunsOnClose(harnessOptions: PiHarnessOptions, harness: unknown): void {
  const runs = (harnessOptions as Record<symbol, unknown>)[RUNS] as PiRuns | undefined;
  const closable = harness as PiHarness | undefined;
  if (!runs || typeof closable?.subscribeClose !== 'function') {
    return;
  }
  closable.subscribeClose(() => {
    for (const run of runs.active.values()) {
      endRun(run, runs, run.pendingEnd ? run.pendingEnd.status : { code: SPAN_STATUS_ERROR, message: 'cancelled' });
    }
  });
}

function instrumentRegistry(registry: PiRegistryReader, options: PiDurableOptions, runs: PiRuns): PiRegistryReader {
  // Cached so identity stays stable: the scheduler hands a task over to a new definition whenever
  // `snapshot().task(kind)` returns a different object than the one it runs.
  const snapshots = new WeakMap<PiRegistrySnapshot, PiRegistrySnapshot>();
  const tasks = new WeakMap<PiTask, PiTask>();
  const tools = new WeakMap<PiTool, PiTool>();

  const wrapTool = (tool: PiTool): PiTool => {
    let wrapped = tools.get(tool);
    if (!wrapped) {
      wrapped = instrumentTool(tool, runs, options);
      tools.set(tool, wrapped);
    }
    return wrapped;
  };

  const wrapTask = (task: PiTask | undefined): PiTask | undefined => {
    if (!task?.definition?.phases) {
      return task;
    }
    let wrapped = tasks.get(task);
    if (!wrapped) {
      const { definition } = task;
      // pi-durable calls a phase on the `phases` object and `abort` on the definition; keep that
      // receiver, so handlers that use `this` work.
      const wrapPhase =
        (phase: PiPhaseHandler, receiver: unknown): PiPhaseHandler =>
        (taskRecord, runtime, context) =>
          runPhase(
            definition.name,
            observed => phase.call(receiver, taskRecord, observed, context),
            runtime,
            runs,
            wrapTool,
          );
      const phases: Record<string, PiPhaseHandler> = {};
      for (const [name, phase] of Object.entries(definition.phases)) {
        phases[name] = typeof phase === 'function' ? wrapPhase(phase, definition.phases) : phase;
      }
      wrapped = {
        ...task,
        definition: {
          ...definition,
          phases,
          ...(typeof definition.abort === 'function' ? { abort: wrapPhase(definition.abort, definition) } : {}),
        },
      };
      tasks.set(task, wrapped);
    }
    return wrapped;
  };

  const wrapSnapshot = (snapshot: PiRegistrySnapshot): PiRegistrySnapshot => {
    let wrapped = snapshots.get(snapshot);
    if (!wrapped) {
      wrapped = new Proxy(snapshot, {
        get(target, property) {
          if (property === 'task') {
            return (name: string) => wrapTask(target.task(name));
          }
          if (property === 'tasks') {
            return () => target.tasks().map(task => wrapTask(task));
          }
          return bound(target, property);
        },
      });
      snapshots.set(snapshot, wrapped);
    }
    return wrapped;
  };

  return new Proxy(registry, {
    get(target, property) {
      if (property === 'snapshot') {
        return () => wrapSnapshot(target.snapshot());
      }
      return bound(target, property);
    },
  });
}

function runPhase(
  kind: string,
  phase: (runtime: PiTaskRuntime) => Promise<unknown>,
  runtime: PiTaskRuntime,
  runs: PiRuns,
  wrapTool: (tool: PiTool) => PiTool,
): Promise<unknown> {
  const { conversationId } = runtime;
  const isRunWork = kind === PI_TASK.GENERATION || kind === PI_TASK.TOOL;
  // A compaction joins the run it was started for. One started while idle has no run, and its
  // `chat` span becomes the root of a trace of its own. Tasks of extensions never join a run.
  const run =
    isRunWork || kind === PI_TASK.COMPACTION
      ? (runs.active.get(conversationId) ?? (isRunWork ? startRun(conversationId, runs) : undefined))
      : undefined;

  let observed = runtime;
  let finishToolPhase: (() => void) | undefined;
  if (run && kind === PI_TASK.GENERATION) {
    observed = observeRunControl(runtime, run, runs);
  } else if (kind === PI_TASK.TOOL) {
    const toolPhase = instrumentToolPhase(runtime, runs, wrapTool);
    observed = toolPhase.runtime;
    finishToolPhase = toolPhase.finish;
  }

  const runInScope = async (scope: Scope): Promise<unknown> => {
    scope.setConversationId(toSentryConversationId(runs, conversationId));
    try {
      return await phase(observed);
    } catch (error) {
      // The scheduler faults a task whose phase throws, and a faulted generation ends its run. A
      // throw after an abort mark, or once the Harness closes, is not a fault.
      if (!runtime.signal?.aborted) {
        captureException(error, { mechanism: { handled: false, type: PI_DURABLE_ORIGIN } });
        if (run && kind === PI_TASK.GENERATION) {
          endRun(run, runs, { code: SPAN_STATUS_ERROR, message: 'internal_error' });
        }
      }
      throw error;
    } finally {
      finishToolPhase?.();
    }
  };

  if (!run) {
    return withCleanScopes(getDefaultIsolationScope().clone(), () =>
      startNewTrace(() => runInScope(getCurrentScope())),
    );
  }
  return withCleanScopes(run.isolationScope, () => withActiveSpan(run.span, runInScope));
}
