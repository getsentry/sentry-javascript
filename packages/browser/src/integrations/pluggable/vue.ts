import { getCurrentHub, Scope } from '@sentry/hub';
import { Integration, SentryEvent } from '@sentry/types';
import { isPlainObject, isUndefined } from '@sentry/utils/is';
import { getGlobalObject } from '@sentry/utils/misc';

/** JSDoc */
interface Metadata {
  [key: string]: any;
  componentName?: string;
  propsData?: {
    [key: string]: any;
  };
  lifecycleHook?: string;
}

/** JSDoc */
export class Vue implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Vue';

  /**
   * @inheritDoc
   */
  private readonly Vue: any; // tslint:disable-line:variable-name

  /**
   * @inheritDoc
   */
  public constructor(options: { Vue?: any } = {}) {
    this.Vue =
      options.Vue ||
      (getGlobalObject() as {
        Vue: any;
      }).Vue;
  }

  /** JSDoc */
  private formatComponentName(vm: any): string {
    if (vm.$root === vm) {
      return 'root instance';
    }
    const name = vm._isVue ? vm.$options.name || vm.$options._componentTag : vm.name;
    return (
      (name ? `component <${name}>` : 'anonymous component') +
      (vm._isVue && vm.$options.__file ? ` at ${vm.$options.__file}` : '')
    );
  }

  /**
   * @inheritDoc
   */
  public install(): void {
    if (!this.Vue || !this.Vue.config) {
      return;
    }

    const oldOnError = this.Vue.config.errorHandler;

    this.Vue.config.errorHandler = (error: Error, vm: { [key: string]: any }, info: string): void => {
      const metadata: Metadata = {};

      if (isPlainObject(vm)) {
        metadata.componentName = this.formatComponentName(vm);
        metadata.propsData = vm.$options.propsData;
      }

      if (!isUndefined(info)) {
        metadata.lifecycleHook = info;
      }

      getCurrentHub().withScope(() => {
        getCurrentHub().configureScope((scope: Scope) => {
          Object.keys(metadata).forEach(key => {
            scope.setExtra(key, metadata[key]);
          });

          scope.addEventProcessor(async (event: SentryEvent) => {
            if (event.sdk) {
              const integrations = event.sdk.integrations || [];
              event.sdk = {
                ...event.sdk,
                integrations: [...integrations, 'vue'],
              };
            }
            return event;
          });
        });

        getCurrentHub().captureException(error, { originalException: error });
      });

      if (typeof oldOnError === 'function') {
        oldOnError.call(this.Vue, error, vm, info);
      }
    };
  }
}
