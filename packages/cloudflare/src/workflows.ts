import { SENTRY_SEGMENT_NAME_SOURCE, CODE_FUNCTION_NAME, SENTRY_OP } from '@sentry/conventions/attributes';
import { GENERAL_FUNCTION_SPAN_OP } from '@sentry/conventions/op';
import type { PropagationContext } from '@sentry/core';
import {
  captureException,
  flush,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import type {
  WorkflowDelayDuration,
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowSleepDuration,
  WorkflowStep,
  WorkflowStepConfig,
  WorkflowStepContext,
  WorkflowStepEvent,
  WorkflowStepRollbackOptions,
  WorkflowTimeoutDuration,
} from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import type { CloudflareOptions } from './client';
import { flushAndDispose, getOriginalWaitUntil } from './flush';
import { instrumentEnv } from './instrumentations/worker/instrumentEnv';
import { addCloudResourceContext } from './scope-utils';
import { init } from './sdk';
import { instrumentContext } from './utils/instrumentContext';
import type { DefaultEnv, ResolveEnv, StrictCloudflareOptions } from './types';

const UUID_REGEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/**
 * Hashes a string to a UUID using SHA-1.
 */
export async function deterministicTraceIdFromInstanceId(instanceId: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(instanceId));
  return (
    Array.from(new Uint8Array(buf))
      // We only need the first 16 bytes for the 32 characters
      .slice(0, 16)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

async function propagationContextFromInstanceId(instanceId: string): Promise<PropagationContext> {
  const traceId = UUID_REGEX.test(instanceId)
    ? instanceId.replace(/-/g, '')
    : await deterministicTraceIdFromInstanceId(instanceId);

  // Derive sampleRand from last 4 characters of the random UUID
  //
  // We cannot store any state between workflow steps, so we derive the
  // sampleRand from the traceId itself. This ensures that the sampling is
  // consistent across all steps in the same workflow instance.
  const sampleRand = parseInt(traceId.slice(-4), 16) / 0xffff;

  return {
    traceId,
    sampleRand,
  };
}

class WrappedWorkflowStep implements WorkflowStep {
  public constructor(
    private _instanceId: string,
    private _options: CloudflareOptions,
    private _step: WorkflowStep,
    private _waitUntil: ExecutionContext['waitUntil'],
  ) {}

  public async do<T extends Rpc.Serializable<T>>(
    name: string,
    callback: (ctx: WorkflowStepContext) => Promise<T>,
    rollbackOptions?: WorkflowStepRollbackOptions<T>,
  ): Promise<T>;
  public async do<T extends Rpc.Serializable<T>, const C extends WorkflowStepConfig>(
    name: string,
    config: C,
    callback: (
      ctx: WorkflowStepContext<C['retries'] extends { delay: infer D } ? D : WorkflowDelayDuration | number>,
    ) => Promise<T>,
    rollbackOptions?: WorkflowStepRollbackOptions<T>,
  ): Promise<T>;
  public async do<T extends Rpc.Serializable<T>>(
    name: string,
    configOrCallback: WorkflowStepConfig | ((ctx: WorkflowStepContext) => Promise<T>),
    callbackOrRollback?: ((ctx: WorkflowStepContext) => Promise<T>) | WorkflowStepRollbackOptions<T>,
    maybeRollback?: WorkflowStepRollbackOptions<T>,
  ): Promise<T> {
    // Capture the current scope, so parent span (e.g., a startSpan surrounding step.do) is preserved
    const scopeForStep = getCurrentScope();

    const hasConfig = typeof configOrCallback !== 'function';
    const config = hasConfig ? configOrCallback : undefined;
    const userCallback = (hasConfig ? callbackOrRollback : configOrCallback) as (
      ctx: WorkflowStepContext,
    ) => Promise<T>;
    const rollbackOptions = (hasConfig ? maybeRollback : callbackOrRollback) as
      | WorkflowStepRollbackOptions<T>
      | undefined;

    const instrumentedCallback = async (...args: unknown[]): Promise<T> => {
      // Feature detection: Cloudflare Workflows (April 2026+) pass a step context
      // with `attempt` and `config.retries.limit`. When available, we only capture
      // errors on the final attempt to avoid duplicates during retries.
      const stepContext = args[0] as { attempt?: number; config?: { retries?: { limit?: number } } } | undefined;
      const attempt = stepContext?.attempt;
      const retryLimit = stepContext?.config?.retries?.limit;
      const hasStepContext = typeof attempt === 'number' && typeof retryLimit === 'number';

      // Only capture error on final attempt (attempt > retryLimit means no more retries left)
      // or when step context is unavailable (legacy behavior - capture all errors)
      const isFinalAttempt = !hasStepContext || attempt > retryLimit;

      return startSpan(
        {
          name,
          scope: scopeForStep,
          attributes: {
            [SENTRY_OP]: GENERAL_FUNCTION_SPAN_OP,
            [CODE_FUNCTION_NAME]: name,
            'workflow.step.name': name,
            'cloudflare.workflow.timeout': config?.timeout,
            'cloudflare.workflow.retries.backoff': config?.retries?.backoff,
            // In workers-types v5, `delay` may be a `WorkflowDelayFunction`, which isn't a valid span attribute value.
            'cloudflare.workflow.retries.delay':
              typeof config?.retries?.delay === 'function' ? undefined : config?.retries?.delay,
            'cloudflare.workflow.retries.limit': config?.retries?.limit,
            'cloudflare.workflow.attempt': attempt,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.workflow',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'task',
          },
        },
        async span => {
          try {
            const result = await (userCallback as (...args: unknown[]) => Promise<T>)(...args);
            span.setStatus({ code: 1 });
            return result;
          } catch (error) {
            if (isFinalAttempt) {
              captureException(error, { mechanism: { handled: true, type: 'auto.faas.cloudflare.workflow' } });
            }
            throw error;
          } finally {
            this._waitUntil(flush(2000));
          }
        },
      );
    };

    if (config) {
      return rollbackOptions
        ? this._step.do(name, config, instrumentedCallback, rollbackOptions)
        : this._step.do(name, config, instrumentedCallback);
    }

    return rollbackOptions
      ? this._step.do(name, instrumentedCallback, rollbackOptions)
      : this._step.do(name, instrumentedCallback);
  }

  public async sleep(name: string, duration: WorkflowSleepDuration): Promise<void> {
    return this._step.sleep(name, duration);
  }

  public async sleepUntil(name: string, timestamp: Date | number): Promise<void> {
    return this._step.sleepUntil(name, timestamp);
  }

  public async waitForEvent<T extends Rpc.Serializable<T>>(
    name: string,
    options: { type: string; timeout?: WorkflowTimeoutDuration | number },
  ): Promise<WorkflowStepEvent<T>> {
    return this._step.waitForEvent<T>(name, options);
  }
}

/**
 * Instruments a Cloudflare Workflow class with Sentry.
 *
 * @example
 * ```typescript
 * const InstrumentedWorkflow = instrumentWorkflowWithSentry(
 *   (env) => ({ dsn: env.SENTRY_DSN }),
 *   MyWorkflowClass
 * );
 *
 * export default InstrumentedWorkflow;
 * ```
 *
 * @param optionsCallback - Function that returns Sentry options to initialize Sentry
 * @param WorkflowClass - The workflow class to instrument
 * @returns Instrumented workflow class with the same interface
 */
export function instrumentWorkflowWithSentry<
  E = DefaultEnv, // Environment type
  P = unknown, // Payload type
  // oxlint-disable-next-line typescript/no-explicit-any
  T extends WorkflowEntrypoint<any, any> = WorkflowEntrypoint<E, P>, // WorkflowEntrypoint type
  // The constraint must not route through `T`: workers-types defaults `WorkflowEntrypoint`'s
  // `Env` to `unknown` (unlike `WorkerEntrypoint`/`DurableObject`, which default to
  // `Cloudflare.Env`), so a bare subclass would be rejected in a `wrangler types` project.
  // The callback env is resolved from the inferred constructor via `ResolveEnv` instead.
  // oxlint-disable-next-line typescript/no-explicit-any
  C extends new (ctx: ExecutionContext, env: any) => WorkflowEntrypoint<any, any> = new (
    ctx: ExecutionContext,
    // oxlint-disable-next-line typescript/no-explicit-any
    env: any,
  ) => T, // Constructor type of the WorkflowEntrypoint class
  O = unknown,
>(optionsCallback: (env: ResolveEnv<C, E>) => StrictCloudflareOptions<O>, WorkFlowClass: C): C {
  return new Proxy(WorkFlowClass, {
    // oxlint-disable-next-line typescript/no-explicit-any
    construct(target: C, args: [ctx: ExecutionContext, env: any], newTarget) {
      const [ctx, env] = args;
      const context = instrumentContext(ctx);
      const options = optionsCallback(env);
      args[0] = context;
      args[1] = instrumentEnv(env as Record<string, unknown>, options) as E;
      const instance = Reflect.construct(target, args, newTarget) as T;
      return new Proxy(instance, {
        get(obj, prop, receiver) {
          if (prop === 'run') {
            return async function (event: WorkflowEvent<P>, step: WorkflowStep): Promise<unknown> {
              setAsyncLocalStorageAsyncContextStrategy();

              return withIsolationScope(async isolationScope => {
                const waitUntil = getOriginalWaitUntil(context).bind(context);
                const client = init({ ...options, ctx: context, enableDedupe: false });
                isolationScope.setClient(client);

                addCloudResourceContext(isolationScope);

                return withScope(async scope => {
                  const propagationContext = await propagationContextFromInstanceId(event.instanceId);
                  scope.setPropagationContext(propagationContext);

                  try {
                    return await obj.run.call(
                      obj,
                      event,
                      new WrappedWorkflowStep(event.instanceId, options, step, waitUntil),
                    );
                  } finally {
                    waitUntil(flushAndDispose(client));
                  }
                });
              });
            };
          }
          return Reflect.get(obj, prop, receiver);
        },
      });
    },
  });
}
