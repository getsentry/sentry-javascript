/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventProcessor, Hub, Integration, IntegrationClass, Scope, Span, Transaction } from '@sentry/types';
import { basename, getGlobalObject, logger, timestampWithMs } from '@sentry/utils';

/**
 * Used to extract Tracing integration from the current client,
 * without the need to import `Tracing` itself from the @sentry/apm package.
 * @deprecated as @sentry/tracing should be used over @sentry/apm.
 */
const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

/**
 * Used to extract BrowserTracing integration from @sentry/tracing
 */
const BROWSER_TRACING_GETTER = ({
  id: 'BrowserTracing',
} as any) as IntegrationClass<Integration>;

const VUE_OP = 'ui.vue';

/** Global Vue object limited to the methods/attributes we require */
interface VueInstance {
  config: {
    errorHandler?(error: Error, vm?: ViewModel, info?: string): void;
  };
  util?: {
    warn(...input: any): void;
  };
  mixin(hooks: { [key: string]: () => void }): void;
}

/** Representation of Vue component internals */
interface ViewModel {
  [key: string]: any;
  // eslint-disable-next-line @typescript-eslint/ban-types
  $root: object;
  $options: {
    [key: string]: any;
    name?: string;
    propsData?: { [key: string]: any };
    _componentTag?: string;
    __file?: string;
    $_sentryPerfHook?: boolean;
  };
  $once(hook: string, cb: () => void): void;
}

/** Vue Integration configuration */
interface IntegrationOptions {
  /** Vue instance to be used inside the integration */
  Vue: VueInstance;

  /**
   * When set to `false`, Sentry will suppress reporting of all props data
   * from your Vue components for privacy concerns.
   */
  attachProps: boolean;
  /**
   * When set to `true`, original Vue's `logError` will be called as well.
   * https://github.com/vuejs/vue/blob/c2b1cfe9ccd08835f2d99f6ce60f67b4de55187f/src/core/util/error.js#L38-L48
   */
  logErrors: boolean;

  /**
   * When set to `true`, enables tracking of components lifecycle performance.
   * It requires `Tracing` integration to be also enabled.
   */
  tracing: boolean;

  /** {@link TracingOptions} */
  tracingOptions: TracingOptions;
}

/** Vue specific configuration for Tracing Integration  */
interface TracingOptions {
  /**
   * Decides whether to track components by hooking into its lifecycle methods.
   * Can be either set to `boolean` to enable/disable tracking for all of them.
   * Or to an array of specific component names (case-sensitive).
   */
  trackComponents: boolean | string[];
  /** How long to wait until the tracked root activity is marked as finished and sent of to Sentry */
  timeout: number;
  /**
   * List of hooks to keep track of during component lifecycle.
   * Available hooks: 'activate' | 'create' | 'destroy' | 'mount' | 'update'
   * Based on https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
   */
  hooks: Operation[];
}

/** Optional metadata attached to Sentry Event */
interface Metadata {
  [key: string]: any;
  componentName?: string;
  propsData?: { [key: string]: any };
  lifecycleHook?: string;
}

// https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
type Hook =
  | 'activated'
  | 'beforeCreate'
  | 'beforeDestroy'
  | 'beforeMount'
  | 'beforeUpdate'
  | 'created'
  | 'deactivated'
  | 'destroyed'
  | 'mounted'
  | 'updated';

type Operation = 'activate' | 'create' | 'destroy' | 'mount' | 'update';

// Mappings from operation to corresponding lifecycle hook.
const HOOKS: { [key in Operation]: Hook[] } = {
  activate: ['activated', 'deactivated'],
  create: ['beforeCreate', 'created'],
  destroy: ['beforeDestroy', 'destroyed'],
  mount: ['beforeMount', 'mounted'],
  update: ['beforeUpdate', 'updated'],
};

const COMPONENT_NAME_REGEXP = /(?:^|[-_/])(\w)/g;
const ROOT_COMPONENT_NAME = 'root';
const ANONYMOUS_COMPONENT_NAME = 'anonymous component';

/** JSDoc */
export class Vue implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Vue';

  /**
   * @inheritDoc
   */
  public name: string = Vue.id;

  private readonly _options: IntegrationOptions;

  /**
   * Cache holding already processed component names
   */
  private readonly _componentsCache: { [key: string]: string } = {};
  private _rootSpan?: Span;
  private _rootSpanTimer?: ReturnType<typeof setTimeout>;
  private _tracingActivity?: number;

  /**
   * @inheritDoc
   */
  public constructor(
    options: Partial<Omit<IntegrationOptions, 'tracingOptions'> & { tracingOptions: Partial<TracingOptions> }>,
  ) {
    logger.log('You are still using the Vue.js integration, consider moving to @sentry/vue');
    this._options = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Vue: getGlobalObject<any>().Vue,
      attachProps: true,
      logErrors: false,
      tracing: false,
      ...options,
      tracingOptions: {
        hooks: ['mount', 'update'],
        timeout: 2000,
        trackComponents: false,
        ...options.tracingOptions,
      },
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._options.Vue) {
      logger.error('Vue integration is missing a Vue instance');
      return;
    }

    this._attachErrorHandler(getCurrentHub);

    if (this._options.tracing) {
      this._startTracing(getCurrentHub);
    }
  }

  /**
   * Extract component name from the ViewModel
   */
  private _getComponentName(vm: ViewModel): string {
    // Such level of granularity is most likely not necessary, but better safe than sorry. — Kamil
    if (!vm) {
      return ANONYMOUS_COMPONENT_NAME;
    }

    if (vm.$root === vm) {
      return ROOT_COMPONENT_NAME;
    }

    if (!vm.$options) {
      return ANONYMOUS_COMPONENT_NAME;
    }

    if (vm.$options.name) {
      return vm.$options.name;
    }

    if (vm.$options._componentTag) {
      return vm.$options._componentTag;
    }

    // injected by vue-loader
    if (vm.$options.__file) {
      const unifiedFile = vm.$options.__file.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/');
      const filename = basename(unifiedFile, '.vue');
      return (
        this._componentsCache[filename] ||
        (this._componentsCache[filename] = filename.replace(COMPONENT_NAME_REGEXP, (_, c: string) =>
          c ? c.toUpperCase() : '',
        ))
      );
    }

    return ANONYMOUS_COMPONENT_NAME;
  }

  /** Keep it as attribute function, to keep correct `this` binding inside the hooks callbacks  */
  // eslint-disable-next-line @typescript-eslint/typedef
  private readonly _applyTracingHooks = (vm: ViewModel, getCurrentHub: () => Hub): void => {
    // Don't attach twice, just in case
    if (vm.$options.$_sentryPerfHook) {
      return;
    }
    vm.$options.$_sentryPerfHook = true;

    const name = this._getComponentName(vm);
    const rootMount = name === ROOT_COMPONENT_NAME;
    const spans: { [key: string]: Span } = {};

    // Render hook starts after once event is emitted,
    // but it ends before the second event of the same type.
    //
    // Because of this, we start measuring inside the first event,
    // but finish it before it triggers, to skip the event emitter timing itself.
    const rootHandler = (hook: Hook): void => {
      const now = timestampWithMs();

      // On the first handler call (before), it'll be undefined, as `$once` will add it in the future.
      // However, on the second call (after), it'll be already in place.
      if (this._rootSpan) {
        this._finishRootSpan(now, getCurrentHub);
      } else {
        vm.$once(`hook:${hook}`, () => {
          // Create an activity on the first event call. There'll be no second call, as rootSpan will be in place,
          // thus new event handler won't be attached.

          // We do this whole dance with `TRACING_GETTER` to prevent `@sentry/apm` from becoming a peerDependency.
          // We also need to ask for the `.constructor`, as `pushActivity` and `popActivity` are static, not instance methods.
          /* eslint-disable @typescript-eslint/no-unsafe-member-access */
          // eslint-disable-next-line deprecation/deprecation
          const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
          if (tracingIntegration) {
            this._tracingActivity = (tracingIntegration as any).constructor.pushActivity('Vue Application Render');
            const transaction = (tracingIntegration as any).constructor.getTransaction();
            if (transaction) {
              this._rootSpan = transaction.startChild({
                description: 'Application Render',
                op: VUE_OP,
              });
            }
            // Use functionality from @sentry/tracing
          } else {
            const activeTransaction = getActiveTransaction(getCurrentHub());
            if (activeTransaction) {
              this._rootSpan = activeTransaction.startChild({
                description: 'Application Render',
                op: VUE_OP,
              });
            }
          }
          /* eslint-enable @typescript-eslint/no-unsafe-member-access */
        });
      }
    };

    const childHandler = (hook: Hook, operation: Operation): void => {
      // Skip components that we don't want to track to minimize the noise and give a more granular control to the user
      const shouldTrack = Array.isArray(this._options.tracingOptions.trackComponents)
        ? this._options.tracingOptions.trackComponents.indexOf(name) > -1
        : this._options.tracingOptions.trackComponents;

      if (!this._rootSpan || !shouldTrack) {
        return;
      }

      const now = timestampWithMs();
      const span = spans[operation];

      // On the first handler call (before), it'll be undefined, as `$once` will add it in the future.
      // However, on the second call (after), it'll be already in place.
      if (span) {
        span.finish();
        this._finishRootSpan(now, getCurrentHub);
      } else {
        vm.$once(`hook:${hook}`, () => {
          if (this._rootSpan) {
            spans[operation] = this._rootSpan.startChild({
              description: `Vue <${name}>`,
              op: `${VUE_OP}.${operation}`,
            });
          }
        });
      }
    };

    // Each component has it's own scope, so all activities are only related to one of them
    this._options.tracingOptions.hooks.forEach(operation => {
      // Retrieve corresponding hooks from Vue lifecycle.
      // eg. mount => ['beforeMount', 'mounted']
      const internalHooks = HOOKS[operation];

      if (!internalHooks) {
        logger.warn(`Unknown hook: ${operation}`);
        return;
      }

      internalHooks.forEach(internalHook => {
        const handler = rootMount
          ? rootHandler.bind(this, internalHook)
          : childHandler.bind(this, internalHook, operation);
        const currentValue = vm.$options[internalHook];

        if (Array.isArray(currentValue)) {
          vm.$options[internalHook] = [handler, ...currentValue];
        } else if (typeof currentValue === 'function') {
          vm.$options[internalHook] = [handler, currentValue];
        } else {
          vm.$options[internalHook] = [handler];
        }
      });
    });
  };

  /** Finish top-level span and activity with a debounce configured using `timeout` option */
  private _finishRootSpan(timestamp: number, getCurrentHub: () => Hub): void {
    if (this._rootSpanTimer) {
      clearTimeout(this._rootSpanTimer);
    }

    this._rootSpanTimer = setTimeout(() => {
      if (this._tracingActivity) {
        // We do this whole dance with `TRACING_GETTER` to prevent `@sentry/apm` from becoming a peerDependency.
        // We also need to ask for the `.constructor`, as `pushActivity` and `popActivity` are static, not instance methods.
        // eslint-disable-next-line deprecation/deprecation
        const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
        if (tracingIntegration) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (tracingIntegration as any).constructor.popActivity(this._tracingActivity);
        }
      }

      // We should always finish the span, only should pop activity if using @sentry/apm
      if (this._rootSpan) {
        this._rootSpan.finish(timestamp);
      }
    }, this._options.tracingOptions.timeout);
  }

  /** Inject configured tracing hooks into Vue's component lifecycles */
  private _startTracing(getCurrentHub: () => Hub): void {
    const applyTracingHooks = this._applyTracingHooks;

    this._options.Vue.mixin({
      beforeCreate(this: ViewModel): void {
        // eslint-disable-next-line deprecation/deprecation
        if (getCurrentHub().getIntegration(TRACING_GETTER) || getCurrentHub().getIntegration(BROWSER_TRACING_GETTER)) {
          // `this` points to currently rendered component
          applyTracingHooks(this, getCurrentHub);
        } else {
          logger.error('Vue integration has tracing enabled, but Tracing integration is not configured');
        }
      },
    });
  }

  /** Inject Sentry's handler into owns Vue's error handler  */
  private _attachErrorHandler(getCurrentHub: () => Hub): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const currentErrorHandler = this._options.Vue.config.errorHandler;

    this._options.Vue.config.errorHandler = (error: Error, vm?: ViewModel, info?: string): void => {
      const metadata: Metadata = {};

      if (vm) {
        try {
          metadata.componentName = this._getComponentName(vm);

          if (this._options.attachProps) {
            metadata.propsData = vm.$options.propsData;
          }
        } catch (_oO) {
          logger.warn('Unable to extract metadata from Vue component.');
        }
      }

      if (info) {
        metadata.lifecycleHook = info;
      }

      if (getCurrentHub().getIntegration(Vue)) {
        // Capture exception in the next event loop, to make sure that all breadcrumbs are recorded in time.
        setTimeout(() => {
          getCurrentHub().withScope(scope => {
            scope.setContext('vue', metadata);
            getCurrentHub().captureException(error);
          });
        });
      }

      if (typeof currentErrorHandler === 'function') {
        currentErrorHandler.call(this._options.Vue, error, vm, info);
      }

      if (this._options.logErrors) {
        if (this._options.Vue.util) {
          this._options.Vue.util.warn(`Error in ${info}: "${error && error.toString()}"`, vm);
        }
        // eslint-disable-next-line no-console
        console.error(error);
      }
    };
  }
}

interface HubType extends Hub {
  getScope?(): Scope | undefined;
}

/** Grabs active transaction off scope */
export function getActiveTransaction<T extends Transaction>(hub: HubType): T | undefined {
  if (hub && hub.getScope) {
    const scope = hub.getScope() as Scope;
    if (scope) {
      return scope.getTransaction() as T | undefined;
    }
  }

  return undefined;
}
