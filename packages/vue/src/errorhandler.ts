import { getCurrentHub } from '@sentry/browser';
import { logger } from '@sentry/utils';

import { formatComponentName, generateComponentTrace } from './components';
import { Options, ViewModel, Vue } from './types';

export const attachErrorHandler = (options: Options, app: Vue): void => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const { errorHandler, warnHandler, silent } = app.config;

  app.config.errorHandler = (error: Error, vm: ViewModel, info: string): void => {
    const metadata: {
      componentName?: string;
      propsData?: { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      lifecycleHook?: string;
    } = {};

    try {
      metadata.componentName = formatComponentName(vm, false);

      if (options.attachProps) {
        // Vue2 - $options.propsData
        // Vue3 - $props
        metadata.propsData = vm.$options.propsData || vm.$props;
      }
    } catch (_oO) {
      logger.warn('Unable to extract metadata from Vue component.');
    }

    metadata.lifecycleHook = info;

    // Capture exception in the next event loop, to make sure that all breadcrumbs are recorded in time.
    setTimeout(() => {
      getCurrentHub().withScope(scope => {
        scope.setContext('vue', metadata);
        getCurrentHub().captureException(error);
      });
    });

    if (typeof errorHandler === 'function') {
      errorHandler.call(options.app, error, vm, info);
    }

    if (options.logErrors) {
      const hasConsole = typeof console !== 'undefined';
      const message = `Error in ${info}: "${error && error.toString()}"`;
      const trace = vm ? generateComponentTrace(vm) : '';

      if (warnHandler) {
        warnHandler.call(null, message, vm, trace);
      } else if (hasConsole && !silent) {
        // eslint-disable-next-line no-console
        console.error(`[Vue warn]: ${message}${trace}`);
      }
    }
  };
};
