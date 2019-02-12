import { captureException, getCurrentHub, withScope } from '@sentry/core';
import { Integration, SentryEvent } from '@sentry/types';
import { isPlainObject, isUndefined } from '@sentry/utils/is';
import { logger } from '@sentry/utils/logger';
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
  public name: string = Vue.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'Vue';

  /**
   * @inheritDoc
   */
  private readonly Vue: any; // tslint:disable-line:variable-name

  /**
   * When set to false, Sentry will suppress reporting all props data
   * from your Vue components for privacy concerns.
   */
  private readonly attachProps: boolean;

  /**
   * @inheritDoc
   */
  public constructor(options: { Vue?: any; attachProps?: boolean } = {}) {
    this.Vue =
      options.Vue ||
      (getGlobalObject() as {
        Vue: any;
      }).Vue;
    this.attachProps = options.attachProps || true;
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
  public setupOnce(): void {
    if (!this.Vue || !this.Vue.config) {
      logger.error('VueIntegration is missing a Vue instance');
      return;
    }

    const oldOnError = this.Vue.config.errorHandler;

    this.Vue.config.errorHandler = (error: Error, vm: { [key: string]: any }, info: string): void => {
      const metadata: Metadata = {};

      if (isPlainObject(vm)) {
        metadata.componentName = this.formatComponentName(vm);

        if (this.attachProps) {
          metadata.propsData = vm.$options.propsData;
        }
      }

      if (!isUndefined(info)) {
        metadata.lifecycleHook = info;
      }

      if (getCurrentHub().getIntegration(Vue)) {
        withScope(scope => {
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

          captureException(error);
        });
      }

      if (typeof oldOnError === 'function') {
        oldOnError.call(this.Vue, error, vm, info);
      }
    };
  }
}
