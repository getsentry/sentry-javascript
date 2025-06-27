import type { ExecutionContext, Rpc } from '@cloudflare/workers-types';
import type { PropagationContext } from '@sentry/core';
import {
  captureException,
  flush,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { addCloudResourceContext } from './scope-utils';
import { init } from './sdk';
import type {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowSleepDuration,
  WorkflowStep,
  WorkflowStepConfig,
  WorkflowStepEvent,
  WorkflowTimeoutDuration,
} from './vendor/workflow';

const UUID_REGEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function propagationContextFromInstanceId(instanceId: string): PropagationContext {
  // Validate and normalize traceId - should be a valid UUID with or without hyphens
  if (!UUID_REGEX.test(instanceId)) {
    throw new Error("Invalid 'instanceId' for workflow: Sentry requires random UUIDs for instanceId.");
  }

  // Remove hyphens to get UUID without hyphens
  const traceId = instanceId.replace(/-/g, '');

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

async function workflowStepWithSentry<V>(
  instanceId: string,
  options: CloudflareOptions,
  callback: () => V,
): Promise<V> {
  setAsyncLocalStorageAsyncContextStrategy();

  return withIsolationScope(async isolationScope => {
    const client = init({ ...options, enableDedupe: false });
    isolationScope.setClient(client);

    addCloudResourceContext(isolationScope);

    return withScope(async scope => {
      const propagationContext = propagationContextFromInstanceId(instanceId);
      scope.setPropagationContext(propagationContext);

      // eslint-disable-next-line no-return-await
      return await callback();
    });
  });
}

class WrappedWorkflowStep implements WorkflowStep {
  public constructor(
    private _instanceId: string,
    private _ctx: ExecutionContext,
    private _options: CloudflareOptions,
    private _step: WorkflowStep,
  ) {}

  public async do<T extends Rpc.Serializable<T>>(name: string, callback: () => Promise<T>): Promise<T>;
  public async do<T extends Rpc.Serializable<T>>(
    name: string,
    config: WorkflowStepConfig,
    callback: () => Promise<T>,
  ): Promise<T>;
  public async do<T extends Rpc.Serializable<T>>(
    name: string,
    configOrCallback: WorkflowStepConfig | (() => Promise<T>),
    maybeCallback?: () => Promise<T>,
  ): Promise<T> {
    const userCallback = (maybeCallback || configOrCallback) as () => Promise<T>;
    const config = typeof configOrCallback === 'function' ? undefined : configOrCallback;

    const instrumentedCallback: () => Promise<T> = async () => {
      return workflowStepWithSentry(this._instanceId, this._options, async () => {
        return startSpan(
          {
            op: 'function.step.do',
            name,
            attributes: {
              'cloudflare.workflow.timeout': config?.timeout,
              'cloudflare.workflow.retries.backoff': config?.retries?.backoff,
              'cloudflare.workflow.retries.delay': config?.retries?.delay,
              'cloudflare.workflow.retries.limit': config?.retries?.limit,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.workflow',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
            },
          },
          async span => {
            try {
              const result = await userCallback();
              span.setStatus({ code: 1 });
              return result;
            } catch (error) {
              captureException(error, { mechanism: { handled: true, type: 'cloudflare' } });
              throw error;
            } finally {
              this._ctx.waitUntil(flush(2000));
            }
          },
        );
      });
    };

    return config ? this._step.do(name, config, instrumentedCallback) : this._step.do(name, instrumentedCallback);
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
  E, // Environment type
  P, // Payload type
  T extends WorkflowEntrypoint<E, P>, // WorkflowEntrypoint type
  C extends new (ctx: ExecutionContext, env: E) => T, // Constructor type of the WorkflowEntrypoint class
>(optionsCallback: (env: E) => CloudflareOptions, WorkFlowClass: C): C {
  return new Proxy(WorkFlowClass, {
    construct(target: C, args: [ctx: ExecutionContext, env: E], newTarget) {
      const [ctx, env] = args;
      const options = optionsCallback(env);
      const instance = Reflect.construct(target, args, newTarget) as T;
      return new Proxy(instance, {
        get(obj, prop, receiver) {
          if (prop === 'run') {
            return async function (event: WorkflowEvent<P>, step: WorkflowStep): Promise<unknown> {
              return obj.run.call(obj, event, new WrappedWorkflowStep(event.instanceId, ctx, options, step));
            };
          }
          return Reflect.get(obj, prop, receiver);
        },
      });
    },
  }) as C;
}
