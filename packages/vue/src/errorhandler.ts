import { captureException } from '@sentry/core';
import type { ViewModel, Vue, VueOptions } from './types';
import { formatComponentName, generateComponentTrace } from './vendor/components';

type UnknownFunc = (...args: unknown[]) => void;

/**
 * Captures an exception with Vue component metadata.
 *
 * This can be used from a Vue `onErrorCaptured` hook when the automatic error handler is disabled or when an error
 * boundary stops the error from propagating to the application-level handler.
 *
 * @param handled - Whether the boundary stops the error from propagating.
 */
export const captureVueException = (
  error: unknown,
  vm: ViewModel | null,
  lifecycleHook: string,
  handled: boolean,
  options?: Partial<VueOptions>,
): void => {
  captureVueExceptionWithMechanism(error, vm, lifecycleHook, handled, options);
};

export const attachErrorHandler = (app: Vue, options?: Partial<VueOptions>): void => {
  const { errorHandler: originalErrorHandler } = app.config;

  app.config.errorHandler = (error: unknown, vm: ViewModel | null, lifecycleHook: string): void => {
    // Capture exception in the next event loop, to make sure that all breadcrumbs are recorded in time.
    setTimeout(() => {
      captureVueExceptionWithMechanism(error, vm, lifecycleHook, !!originalErrorHandler, options);
    });

    // Check if the current `app.config.errorHandler` is explicitly set by the user before calling it.
    if (typeof originalErrorHandler === 'function' && app.config.errorHandler) {
      (originalErrorHandler as UnknownFunc).call(app, error, vm, lifecycleHook);
    } else {
      throw error;
    }
  };
};

function captureVueExceptionWithMechanism(
  error: unknown,
  vm: ViewModel | null,
  lifecycleHook: string,
  handled: boolean,
  options?: Partial<VueOptions>,
): void {
  const componentName = formatComponentName(vm || undefined, false);
  const trace = vm ? generateComponentTrace(vm) : '';
  const metadata: Record<string, unknown> = {
    componentName,
    lifecycleHook,
    trace,
  };

  if (options?.attachProps !== false && vm) {
    // Vue2 - $options.propsData
    // Vue3 - $props
    if (vm.$options?.propsData) {
      metadata.propsData = vm.$options.propsData;
    } else if (vm.$props) {
      metadata.propsData = vm.$props;
    }
  }

  captureException(error, {
    captureContext: { contexts: { vue: metadata } },
    mechanism: { handled, type: 'auto.function.vue.error_handler' },
  });
}
