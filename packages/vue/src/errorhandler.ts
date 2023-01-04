import { getCurrentHub } from '@sentry/browser';

import { formatComponentName, generateComponentTrace } from './components';
import type { Options, ViewModel, Vue } from './types';

type UnknownFunc = (...args: unknown[]) => void;

export const attachErrorHandler = (app: Vue, options: Options): void => {
  const { errorHandler, warnHandler, silent } = app.config;

  app.config.errorHandler = (error: Error, vm: ViewModel, lifecycleHook: string): void => {
    const componentName = formatComponentName(vm, false);
    const trace = vm ? generateComponentTrace(vm) : '';
    const metadata: Record<string, unknown> = {
      componentName,
      lifecycleHook,
      trace,
    };

    if (options.attachProps && vm) {
      // Vue2 - $options.propsData
      // Vue3 - $props
      if (vm.$options && vm.$options.propsData) {
        metadata.propsData = vm.$options.propsData;
      } else if (vm.$props) {
        metadata.propsData = vm.$props;
      }
    }

    // Capture exception in the next event loop, to make sure that all breadcrumbs are recorded in time.
    setTimeout(() => {
      getCurrentHub().withScope(scope => {
        scope.setContext('vue', metadata);
        getCurrentHub().captureException(error);
      });
    });

    if (typeof errorHandler === 'function') {
      (errorHandler as UnknownFunc).call(app, error, vm, lifecycleHook);
    }

    if (options.logErrors) {
      const hasConsole = typeof console !== 'undefined';
      const message = `Error in ${lifecycleHook}: "${error && error.toString()}"`;

      if (warnHandler) {
        (warnHandler as UnknownFunc).call(null, message, vm, trace);
      } else if (hasConsole && !silent) {
        // eslint-disable-next-line no-console
        console.error(`[Vue warn]: ${message}${trace}`);
      }
    }
  };
};
