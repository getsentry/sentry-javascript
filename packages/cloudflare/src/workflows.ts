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
import type {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowSleepDuration,
  WorkflowStep,
  WorkflowStepConfig,
  WorkflowStepEvent,
  WorkflowTimeoutDuration,
} from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { addCloudResourceContext } from './scope-utils';
import { init } from './sdk';

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
    const client = init({ ...options, isWorkflow: true });
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
    if (typeof configOrCallback === 'function') {
      // do(name, callback)
      return this._step.do(name, async () => {
        // eslint-disable-next-line no-return-await
        return await workflowStepWithSentry(this._instanceId, this._options, async () => {
          // eslint-disable-next-line no-return-await
          return await startSpan(
            {
              op: 'function.step.do',
              name,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.workflow',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
              },
            },
            async span => {
              try {
                const result = await configOrCallback();
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
      });
    } else if (typeof maybeCallback === 'function') {
      // do(name, config, callback)
      return this._step.do(name, configOrCallback, async () => {
        // eslint-disable-next-line no-return-await
        return await workflowStepWithSentry(this._instanceId, this._options, async () => {
          // eslint-disable-next-line no-return-await
          return await startSpan(
            {
              op: 'function.step.do',
              name,
              attributes: {
                'cloudflare.workflow.timeout': configOrCallback?.timeout,
                'cloudflare.workflow.retries.backoff': configOrCallback?.retries?.backoff,
                'cloudflare.workflow.retries.delay': configOrCallback?.retries?.delay,
                'cloudflare.workflow.retries.limit': configOrCallback?.retries?.limit,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.workflow',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
              },
            },
            async span => {
              try {
                const result = await maybeCallback();
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
      });
    } else {
      throw new Error(
        'Invalid arguments for `step.do` method. Expected either (name, callback) or (name, config, callback).',
      );
    }
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
 *
 * @param optionsCallback
 * @param WorkFlowClass
 * @returns
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
