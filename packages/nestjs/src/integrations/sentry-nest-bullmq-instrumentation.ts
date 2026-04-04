import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import type { Scope, Span } from '@sentry/core';
import {
  addNonEnumerableProperty,
  captureException,
  SDK_VERSION,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import { getBullMQProcessSpanOptions } from './helpers';
import type { ProcessorDecoratorTarget } from './types';

const supportedVersions = ['>=10.0.0'];
const COMPONENT = '@nestjs/bullmq';

// Metadata key used by @nestjs/bullmq's @OnWorkerEvent decorator (via NestJS SetMetadata)
const ON_WORKER_EVENT_METADATA = 'bullmq:worker_events_metadata';

const SENTRY_ISOLATION_SCOPE_KEY = '_sentryIsolationScope';
const SENTRY_SPAN_KEY = '_sentrySpan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobLike = Record<string, any>;

function getScopeFromJob(job: JobLike): Scope | undefined {
  return job?.[SENTRY_ISOLATION_SCOPE_KEY] as Scope | undefined;
}

function setScopeOnJob(job: JobLike, scope: Scope): void {
  addNonEnumerableProperty(job, SENTRY_ISOLATION_SCOPE_KEY, scope);
}

function getSpanFromJob(job: JobLike): Span | undefined {
  return job?.[SENTRY_SPAN_KEY] as Span | undefined;
}

function setSpanOnJob(job: JobLike, span: Span): void {
  addNonEnumerableProperty(job, SENTRY_SPAN_KEY, span);
}

/**
 * Custom instrumentation for nestjs bullmq module.
 *
 * This hooks into the `@Processor` class decorator, which is applied on queue processor classes.
 * It wraps the `process` method and any `@OnWorkerEvent` lifecycle methods on the decorated class
 * to fork the isolation scope for each job invocation, create a span, and capture errors.
 *
 * All lifecycle events for a single job share the same isolation scope (stored on the Job object).
 * The span is created via `startSpanManual` and ended either by a terminal event handler
 * (`completed`/`failed`) or by `process()` itself if no appropriate handler is defined.
 */
export class SentryNestBullMQInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs-bullmq', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    const moduleDef = new InstrumentationNodeModuleDefinition(COMPONENT, supportedVersions);

    moduleDef.files.push(this._getProcessorFileInstrumentation(supportedVersions));
    return moduleDef;
  }

  /**
   * Wraps the @Processor decorator.
   */
  private _getProcessorFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/bullmq/dist/decorators/processor.decorator.js',
      versions,
      (moduleExports: { Processor: ProcessorDecoratorTarget }) => {
        if (isWrapped(moduleExports.Processor)) {
          this._unwrap(moduleExports, 'Processor');
        }
        this._wrap(moduleExports, 'Processor', this._createWrapProcessor());
        return moduleExports;
      },
      (moduleExports: { Processor: ProcessorDecoratorTarget }) => {
        this._unwrap(moduleExports, 'Processor');
      },
    );
  }

  /**
   * Creates a wrapper function for the @Processor class decorator.
   */
  private _createWrapProcessor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapProcessor(original: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function wrappedProcessor(...decoratorArgs: any[]) {
        // Extract queue name from decorator args
        // @Processor('queueName') or @Processor({ name: 'queueName' })
        const queueName =
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          typeof decoratorArgs[0] === 'string' ? decoratorArgs[0] : decoratorArgs[0]?.name || 'unknown';

        // Get the original class decorator
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const classDecorator = original(...decoratorArgs);

        // Return a new class decorator that wraps the process method and lifecycle handlers
        return function (target: ProcessorDecoratorTarget) {
          // Scan prototype for @OnWorkerEvent lifecycle methods
          let hasCompletedHandler = false;
          let hasFailedHandler = false;
          const lifecycleMethods: { key: string; method: Function; eventName: string }[] = [];

          const prototypeKeys = Object.getOwnPropertyNames(target.prototype);
          for (const key of prototypeKeys) {
            if (key === 'constructor' || key === 'process') continue;

            const method = target.prototype[key];
            if (typeof method !== 'function' || method.__SENTRY_INSTRUMENTED__) continue;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            let eventMetadata: { eventName: string } | undefined;
            try {
              // NestJS's SetMetadata stores metadata on the method function itself
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              eventMetadata = Reflect.getMetadata(ON_WORKER_EVENT_METADATA, method);
            } catch {
              continue;
            }
            if (!eventMetadata?.eventName) continue;

            if (eventMetadata.eventName === 'completed') hasCompletedHandler = true;
            if (eventMetadata.eventName === 'failed') hasFailedHandler = true;
            lifecycleMethods.push({ key, method, eventName: eventMetadata.eventName });
          }

          // Wrap the process method
          const originalProcess = target.prototype.process;

          if (
            originalProcess &&
            typeof originalProcess === 'function' &&
            !target.__SENTRY_INTERNAL__ &&
            !originalProcess.__SENTRY_INSTRUMENTED__
          ) {
            target.prototype.process = new Proxy(originalProcess, {
              apply: (originalProcessFn, thisArg, args) => {
                const job = args[0] as JobLike;
                const existingScope = getScopeFromJob(job);

                const runProcess = (isolationScope: Scope): Promise<unknown> => {
                  if (!existingScope) {
                    setScopeOnJob(job, isolationScope);
                  }

                  return startSpanManual(getBullMQProcessSpanOptions(queueName), async span => {
                    if (!getSpanFromJob(job)) {
                      setSpanOnJob(job, span);
                    }

                    let processSucceeded = true;
                    try {
                      return await originalProcessFn.apply(thisArg, args);
                    } catch (error) {
                      processSucceeded = false;
                      captureException(error, {
                        mechanism: {
                          handled: false,
                          type: 'auto.queue.nestjs.bullmq',
                        },
                      });
                      throw error;
                    } finally {
                      // End span here only if the appropriate terminal handler doesn't exist
                      if ((!processSucceeded && !hasFailedHandler) || (processSucceeded && !hasCompletedHandler)) {
                        span.end();
                      }
                    }
                  });
                };

                if (existingScope) {
                  return withIsolationScope(existingScope, runProcess);
                }
                return withIsolationScope(runProcess);
              },
            });

            target.prototype.process.__SENTRY_INSTRUMENTED__ = true;
          }

          // Wrap lifecycle methods
          for (const { key, method, eventName } of lifecycleMethods) {
            const isTerminalEvent = eventName === 'completed' || eventName === 'failed';

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wrappedMethod: any = new Proxy(method, {
              apply: (originalMethod, thisArg, args) => {
                const job = args[0] as JobLike;
                const storedScope = getScopeFromJob(job);

                const runHandler = (isolationScope: Scope): unknown => {
                  if (!storedScope) {
                    setScopeOnJob(job, isolationScope);
                  }
                  try {
                    return originalMethod.apply(thisArg, args);
                  } catch (error) {
                    captureException(error, {
                      mechanism: {
                        handled: false,
                        type: 'auto.queue.nestjs.bullmq',
                      },
                    });
                    throw error;
                  } finally {
                    if (isTerminalEvent) {
                      const span = getSpanFromJob(job);
                      span?.end();
                    }
                  }
                };

                if (storedScope) {
                  return withIsolationScope(storedScope, runHandler);
                }
                return withIsolationScope(runHandler);
              },
            });

            // Copy reflect-metadata from original method to wrapped method.
            // NestJS uses Reflect.getMetadata() keyed by object identity to discover
            // @OnWorkerEvent handlers. Without this, the Proxy (a different object) won't
            // be recognized as a lifecycle handler and NestJS won't register it.
            try {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const metadataKeys: string[] = Reflect.getOwnMetadataKeys?.(method) ?? [];
              for (const metaKey of metadataKeys) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const metaValue = Reflect.getOwnMetadata(metaKey, method);
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore - reflect-metadata of nestjs adds these methods to Reflect
                Reflect.defineMetadata(metaKey, metaValue, wrappedMethod);
              }
            } catch {
              // reflect-metadata not available — skip
            }

            target.prototype[key] = wrappedMethod;
            wrappedMethod.__SENTRY_INSTRUMENTED__ = true;
          }

          // Apply the original class decorator
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return classDecorator(target);
        };
      };
    };
  }
}
