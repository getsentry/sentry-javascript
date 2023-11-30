import { hasTracingEnabled } from '@sentry/core';
import type { Hub, Integration } from '@sentry/types';
import { GLOBAL_OBJ, arrayify, consoleSandbox } from '@sentry/utils';

import { DEFAULT_HOOKS } from './constants';
import { attachErrorHandler } from './errorhandler';
import { createTracingMixins } from './tracing';
import type { Options, Vue, VueOptions } from './types';

const globalWithVue = GLOBAL_OBJ as typeof GLOBAL_OBJ & { Vue: Vue };

const DEFAULT_CONFIG: VueOptions = {
  Vue: globalWithVue.Vue,
  attachProps: true,
  logErrors: true,
  hooks: DEFAULT_HOOKS,
  timeout: 2000,
  trackComponents: false,
};

/**
 * Initialize Vue error & performance tracking.
 */
export class VueIntegration implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Vue';

  /**
   * @inheritDoc
   */
  public name: string;

  private readonly _options: Partial<VueOptions>;

  public constructor(options: Partial<VueOptions> = {}) {
    this.name = VueIntegration.id;
    this._options = options;
  }

  /** @inheritDoc */
  public setupOnce(_addGlobaleventProcessor: unknown, getCurrentHub: () => Hub): void {
    this._setupIntegration(getCurrentHub());
  }

  /** Just here for easier testing */
  protected _setupIntegration(hub: Hub): void {
    const client = hub.getClient();
    const options: Options = { ...DEFAULT_CONFIG, ...(client && client.getOptions()), ...this._options };

    if (!options.Vue && !options.app) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          `[@sentry/vue]: Misconfigured SDK. Vue specific errors will not be captured.
Update your \`Sentry.init\` call with an appropriate config option:
\`app\` (Application Instance - Vue 3) or \`Vue\` (Vue Constructor - Vue 2).`,
        );
      });
      return;
    }

    if (options.app) {
      const apps = arrayify(options.app);
      apps.forEach(app => vueInit(app, options));
    } else if (options.Vue) {
      vueInit(options.Vue, options);
    }
  }
}

const vueInit = (app: Vue, options: Options): void => {
  // Check app is not mounted yet - should be mounted _after_ init()!
  // This is _somewhat_ private, but in the case that this doesn't exist we simply ignore it
  // See: https://github.com/vuejs/core/blob/eb2a83283caa9de0a45881d860a3cbd9d0bdd279/packages/runtime-core/src/component.ts#L394
  const appWithInstance = app as Vue & {
    _instance?: {
      isMounted?: boolean;
    };
  };

  const isMounted = appWithInstance._instance && appWithInstance._instance.isMounted;
  if (isMounted === true) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.',
      );
    });
  }

  attachErrorHandler(app, options);

  if (hasTracingEnabled(options)) {
    app.mixin(
      createTracingMixins({
        ...options,
        ...options.tracingOptions,
      }),
    );
  }
};
