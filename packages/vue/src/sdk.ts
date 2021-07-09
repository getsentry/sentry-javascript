import { init as browserInit, SDK_VERSION } from '@sentry/browser';
import { getGlobalObject, logger } from '@sentry/utils';

import { attachErrorHandler } from './errorhandler';
import { createTracingMixins } from './tracing';
import { Options, Vue, TracingOptions } from './types';

const DEFAULT_CONFIG: Options = {
  Vue: getGlobalObject<{ Vue: Vue }>().Vue,
  attachProps: true,
  logErrors: false,
  hooks: ['activate', 'mount', 'update'],
  timeout: 2000,
  trackComponents: false,
  _metadata: {
    sdk: {
      name: 'sentry.javascript.vue',
      packages: [
        {
          name: 'npm:@sentry/vue',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    },
  },
};

/**
 * Inits the Vue SDK
 */
export function init(
  config: Partial<Omit<Options, 'tracingOptions'> & { tracingOptions: Partial<TracingOptions> }> = {},
): void {
  const options = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  if (!options.app) {
    options.app = options.Vue;
  }

  browserInit(options);

  const { app } = options;

  if (!app) {
    logger.warn(
      'Misconfigured SDK. Vue specific errors will not be captured.\n' +
        'Update your `Sentry.init` call with an appropriate config option:\n' +
        '`app` (Application Instance - Vue 3) or `Vue` (Vue Constructor - Vue 2).',
    );
    return;
  }

  attachErrorHandler(options, app);

  if ('tracesSampleRate' in options || 'tracesSampler' in options) {
    app.mixin(
      createTracingMixins({
        ...options,
        ...options.tracingOptions,
      }),
    );
  }
}
