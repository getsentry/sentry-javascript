import { consoleSandbox, defineIntegration, GLOBAL_OBJ, hasSpansEnabled } from '@sentry/core';
import { DEFAULT_HOOKS } from './constants';
import { DEBUG_BUILD } from './debug-build';
import { attachErrorHandler } from './errorhandler';
import { createTracingMixins } from './tracing';
import type { Options, Vue, VueOptions } from './types';

const globalWithVue = GLOBAL_OBJ as typeof GLOBAL_OBJ & { Vue: Vue };

const DEFAULT_CONFIG: VueOptions = {
  Vue: globalWithVue.Vue,
  attachProps: true,
  attachErrorHandler: true,
  tracingOptions: {
    hooks: DEFAULT_HOOKS,
    timeout: 2000,
    trackComponents: false,
  },
};

const INTEGRATION_NAME = 'Vue' as const;

export type VueIntegrationOptions = Partial<VueOptions>;

export const vueIntegration = defineIntegration((integrationOptions: Partial<VueOptions> = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const options: Options = { ...DEFAULT_CONFIG, ...client.getOptions(), ...integrationOptions };
      if (!options.Vue && !options.app) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            '[@sentry/vue]: Misconfigured SDK. Vue specific errors will not be captured. Update your `Sentry.init` call with an appropriate config option: `app` (Application Instance - Vue 3) or `Vue` (Vue Constructor - Vue 2).',
          );
        });
        return;
      }

      if (options.app) {
        const apps = Array.isArray(options.app) ? options.app : [options.app];
        apps.forEach(app => vueInit(app, options));
      } else if (options.Vue) {
        vueInit(options.Vue, options);
      }
    },
  };
});

const vueInit = (app: Vue, options: Options): void => {
  if (DEBUG_BUILD) {
    // Check app is not mounted yet - should be mounted _after_ init()!
    // This is _somewhat_ private, but in the case that this doesn't exist we simply ignore it
    // See: https://github.com/vuejs/core/blob/eb2a83283caa9de0a45881d860a3cbd9d0bdd279/packages/runtime-core/src/component.ts#L394
    const appWithInstance = app as Vue & {
      _instance?: {
        isMounted?: boolean;
      };
    };

    const isMounted = appWithInstance._instance?.isMounted;
    if (isMounted === true) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          '[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.',
        );
      });
    }
  }

  if (options.attachErrorHandler) {
    attachErrorHandler(app, options);
  }

  if (hasSpansEnabled(options)) {
    const mixins = createTracingMixins(options.tracingOptions);
    app.mixin(mixins);
    warnIfMixinWasDropped(app, mixins);
  }
};

/**
 * `app.mixin()` is a no-op when Options API is disabled (default in Nuxt 5).
 * Without mixins (Options API) users lose every UI span (render, mount, etc.)

 * See: https://github.com/vuejs/core/blob/v3.5.41/packages/runtime-core/src/apiCreateApp.ts
 */
function warnIfMixinWasDropped(app: Vue, mixin: unknown): void {
  // Vue 2 has no `_context` and no Options API flag, so there is nothing to check.
  const mixins = (app as Vue & { _context?: { mixins?: unknown[] } })._context?.mixins;

  if (!mixins || mixins.includes(mixin)) {
    return;
  }

  // `createNuxtApp()` sets `$nuxt` on the Vue app before it calls the `app:created` hook (where Nuxt SDK adds this integration).
  const fix =
    '$nuxt' in app
      ? 'Set `vue: { optionsApi: true }` in your `nuxt.config.ts`.'
      : 'Set `__VUE_OPTIONS_API__` to `true` in the `define` config of your bundler.';

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      `[@sentry/vue]: The Vue Options API is disabled (\`__VUE_OPTIONS_API__: false\`), so Sentry cannot record UI spans. You lose \`Application Render\` and the component mount, update and unmount spans. Errors, pageload spans and navigation spans still work. ${fix}`,
    );
  });
}
