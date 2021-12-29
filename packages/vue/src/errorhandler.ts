import { getCurrentHub } from '@sentry/browser';

import { formatComponentName, generateComponentTrace } from './components';
import { Options, ViewModel, Vue } from './types';

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

    if (vm && options.attachProps) {
      // Vue2 - $options.propsData
      // Vue3 - $props
      metadata.propsData = vm.$options.propsData || vm.$props;
    }

    // Capture exception in the next event loop, to make sure that all breadcrumbs are recorded in time.
    setTimeout(() => {
      getCurrentHub().withScope(scope => {
        scope.addContext('vue', metadata);
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
