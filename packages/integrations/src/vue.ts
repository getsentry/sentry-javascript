import { EventProcessor, Hub, Integration } from '@sentry/types';
import { basename, getGlobalObject, logger, timestampWithMs } from '@sentry/utils';
import { Integrations as APMIntegrations, Span as SpanClass } from '@sentry/apm';

interface IntegrationOptions {
  Vue: any;
  /**
   * When set to false, Sentry will suppress reporting of all props data
   * from your Vue components for privacy concerns.
   */
  attachProps: boolean;
  /**
   * When set to true, original Vue's `logError` will be called as well.
   * https://github.com/vuejs/vue/blob/c2b1cfe9ccd08835f2d99f6ce60f67b4de55187f/src/core/util/error.js#L38-L48
   */
  logErrors: boolean;
  tracing: boolean;
  tracingOptions: TracingOptions;
}

interface TracingOptions {
  track: boolean | Array<string>;
  timeout: number;
  hooks: Array<Hook>;
}

interface ViewModel {
  [key: string]: any;
  $root: object;
  $options: {
    [key: string]: any;
    name?: string;
    propsData?: { [key: string]: any };
    _componentTag?: string;
    __file?: string;
    $_sentryPerfHook?: boolean;
  };
  $once: (hook: string, cb: () => void) => void;
}

/** JSDoc */
interface Metadata {
  [key: string]: any;
  componentName?: string;
  propsData?: { [key: string]: any };
  lifecycleHook?: string;
}

// https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
type Hook =
  | 'beforeCreate'
  | 'created'
  | 'beforeMount'
  | 'mounted'
  | 'beforeUpdate'
  | 'updated'
  | 'activated'
  | 'deactivated'
  | 'beforeDestroy'
  | 'destroyed';

// Mappings from lifecycle hook to corresponding operation,
// used to track already started measurements.
const OPERATIONS = {
  beforeCreate: 'create',
  created: 'create',
  beforeMount: 'mount',
  mounted: 'mount',
  beforeUpdate: 'update',
  updated: 'update',
  activated: 'activate',
  deactivated: 'activate',
  beforeDestroy: 'destroy',
  destroyed: 'destroy',
};

const COMPONENT_NAME_REGEXP = /(?:^|[-_/])(\w)/g;
const ROOT_COMPONENT_NAME = 'root';
const ANONYMOUS_COMPONENT_NAME = 'anonymous component';

/** JSDoc */
export class Vue implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Vue.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Vue';

  private _options: IntegrationOptions;

  /**
   * Cache holding already processed component names
   */
  private componentsCache = Object.create(null);
  private rootSpan?: SpanClass;
  private rootSpanTimer?: ReturnType<typeof setTimeout>;
  private tracingActivity?: number;

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<IntegrationOptions>) {
    this._options = {
      Vue: getGlobalObject<any>().Vue,
      attachProps: true,
      logErrors: false,
      tracing: false,
      ...options,
      tracingOptions: {
        track: false,
        hooks: ['beforeMount', 'mounted', 'beforeUpdate', 'updated'],
        timeout: 2000,
        ...options.tracingOptions,
      },
    };
  }

  private getComponentName(vm: ViewModel): string {
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
        this.componentsCache[filename] ||
        (this.componentsCache[filename] = filename.replace(COMPONENT_NAME_REGEXP, (_, c) => (c ? c.toUpperCase() : '')))
      );
    }

    return ANONYMOUS_COMPONENT_NAME;
  }

  private applyTracingHooks(vm: ViewModel, getCurrentHub: () => Hub): void {
    // Don't attach twice, just in case
    if (vm.$options.$_sentryPerfHook) return;
    vm.$options.$_sentryPerfHook = true;

    const name = this.getComponentName(vm);
    const rootMount = name === ROOT_COMPONENT_NAME;
    const spans: { [key: string]: any } = {};

    // Render hook starts after once event is emitted,
    // but it ends before the second event of the same type.
    //
    // Because of this, we start measuring inside the first event,
    // but finish it before it triggers, to skip the event emitter timing itself.
    const rootHandler = (hook: Hook) => {
      const now = timestampWithMs();

      // On the first handler call (before), it'll be undefined, as `$once` will add it in the future.
      // However, on the second call (after), it'll be already in place.
      if (this.rootSpan) {
        this.finishRootSpan(now);
      } else {
        vm.$once(`hook:${hook}`, () => {
          // Create an activity on the first event call. There'll be no second call, as rootSpan will be in place,
          // thus new event handler won't be attached.
          this.tracingActivity = APMIntegrations.Tracing.pushActivity('Vue Application Render');
          this.rootSpan = getCurrentHub().startSpan({
            description: 'Application Render',
            op: 'Vue',
          }) as SpanClass;
        });
      }
    };

    const childHandler = (hook: Hook) => {
      // Skip components that we don't want to track to minimize the noise and give a more granular control to the user
      const shouldTrack = Array.isArray(this._options.tracingOptions.track)
        ? this._options.tracingOptions.track.includes(name)
        : this._options.tracingOptions.track;

      if (!this.rootSpan || !shouldTrack) {
        return;
      }

      const now = timestampWithMs();
      const op = OPERATIONS[hook];
      const span = spans[op];

      // On the first handler call (before), it'll be undefined, as `$once` will add it in the future.
      // However, on the second call (after), it'll be already in place.
      if (span) {
        span.finish();
        this.finishRootSpan(now);
      } else {
        vm.$once(`hook:${hook}`, () => {
          if (this.rootSpan) {
            spans[op] = this.rootSpan.child({
              description: `Vue <${name}>`,
              op,
            });
          }
        });
      }
    };

    // Each compomnent has it's own scope, so all activities are only related to one of them
    this._options.tracingOptions.hooks.forEach(hook => {
      const handler = rootMount ? rootHandler.bind(this, hook) : childHandler.bind(this, hook);
      const currentValue = vm.$options[hook];

      if (Array.isArray(currentValue)) {
        vm.$options[hook] = [handler, ...currentValue];
      } else if (typeof currentValue === 'function') {
        vm.$options[hook] = [handler, currentValue];
      } else {
        vm.$options[hook] = [handler];
      }
    });
  }

  private finishRootSpan(timestamp: number): void {
    if (this.rootSpanTimer) {
      clearTimeout(this.rootSpanTimer);
    }

    this.rootSpanTimer = setTimeout(() => {
      if (this.rootSpan) {
        this.rootSpan.timestamp = timestamp;
      }
      if (this.tracingActivity) {
        APMIntegrations.Tracing.popActivity(this.tracingActivity);
      }
    }, this._options.tracingOptions.timeout);
  }

  private startTracing(getCurrentHub: () => Hub): void {
    const applyTracingHooks = this.applyTracingHooks.bind(this);

    this._options.Vue.mixin({
      beforeCreate() {
        // TODO: Move this check to `setupOnce` when we rework integrations initialization in v6
        if (getCurrentHub().getIntegration(APMIntegrations.Tracing)) {
          // `this` points to currently rendered component
          applyTracingHooks(this, getCurrentHub);
        } else {
          logger.error('Vue integration has tracing enabled, but Tracing integration is not configured');
        }
      },
    });
  }

  private attachErrorHandler(getCurrentHub: () => Hub): void {
    if (!this._options.Vue.config) {
      return logger.error('Vue instance is missing required `config` attribute');
    }

    const currentErrorHandler = this._options.Vue.config.errorHandler;

    this._options.Vue.config.errorHandler = (error: Error, vm: ViewModel, info: string): void => {
      const metadata: Metadata = {};

      if (vm) {
        try {
          metadata.componentName = this.getComponentName(vm);

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
        this._options.Vue.util.warn(`Error in ${info}: "${error.toString()}"`, vm);
        console.error(error); // tslint:disable-line:no-console
      }
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!this._options.Vue) {
      return logger.error('Vue integration is missing a Vue instance');
    }

    this.attachErrorHandler(getCurrentHub);

    if (this._options.tracing) {
      this.startTracing(getCurrentHub);
    }
  }
}
