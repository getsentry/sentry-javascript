import { EventProcessor, Hub, Integration } from '@sentry/types';
import { getGlobalObject, isPlainObject, logger } from '@sentry/utils';

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
  private readonly _Vue: any; // tslint:disable-line:variable-name

  /**
   * When set to false, Sentry will suppress reporting all props data
   * from your Vue components for privacy concerns.
   */
  private readonly _attachProps: boolean = true;

  /**
   * When set to true, original Vue's `logError` will be called as well.
   * https://github.com/vuejs/vue/blob/c2b1cfe9ccd08835f2d99f6ce60f67b4de55187f/src/core/util/error.js#L38-L48
   */
  private readonly _logErrors: boolean = false;

  /**
   * @inheritDoc
   */
  public constructor(options: { Vue?: any; attachProps?: boolean; logErrors?: boolean } = {}) {
    // tslint:disable-next-line: no-unsafe-any
    this._Vue = options.Vue || getGlobalObject<any>().Vue;

    if (options.logErrors !== undefined) {
      this._logErrors = options.logErrors;
    }
    if (options.attachProps === false) {
      this._attachProps = false;
    }
  }

  /** JSDoc */
  private _formatComponentName(vm: any): string {
    // tslint:disable:no-unsafe-any

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
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    // tslint:disable:no-unsafe-any

    if (!this._Vue || !this._Vue.config) {
      logger.error('VueIntegration is missing a Vue instance');
      return;
    }

    const oldOnError = this._Vue.config.errorHandler;

    this._Vue.config.errorHandler = (error: Error, vm: { [key: string]: any }, info: string): void => {
      const metadata: Metadata = {};

      if (isPlainObject(vm)) {
        metadata.componentName = this._formatComponentName(vm);

        if (this._attachProps) {
          metadata.propsData = vm.$options.propsData;
        }
      }

      if (info !== void 0) {
        metadata.lifecycleHook = info;
      }

      if (getCurrentHub().getIntegration(Vue)) {
        // This timeout makes sure that any breadcrumbs are recorded before sending it off the sentry
        setTimeout(() => {
          getCurrentHub().withScope(scope => {
            scope.setContext('vue', metadata);
            getCurrentHub().captureException(error);
          });
        });
      }

      if (typeof oldOnError === 'function') {
        oldOnError.call(this._Vue, error, vm, info);
      }

      if (this._logErrors) {
        if (process && process.env && process.env.NODE_ENV !== 'production') {
          this._Vue.util.warn(`Error in ${info}: "${error.toString()}"`, vm);
        }
        // tslint:disable-next-line:no-console
        console.error(error);
      }
    };
  }
}
