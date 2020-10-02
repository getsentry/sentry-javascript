/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserClient, BrowserOptions, defaultIntegrations } from '@sentry/browser';
import { initAndBind } from '@sentry/core';
import { Hub, Integration, IntegrationClass, Scope, Span, Transaction } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

export interface VueOptions extends BrowserOptions {
  /**
   * When set to `false`, Sentry will suppress reporting of all props data
   * from your Vue components for privacy concerns.
   */
  attachProps?: boolean;
  /**
   * When set to `true`, original Vue's `logError` will be called as well.
   * https://github.com/vuejs/vue/blob/c2b1cfe9ccd08835f2d99f6ce60f67b4de55187f/src/core/util/error.js#L38-L48
   */
  logErrors?: boolean;

  /**
   * Decides whether to track components by hooking into its lifecycle methods.
   * Can be either set to `boolean` to enable/disable tracking for all of them.
   * Or to an array of specific component names (case-sensitive).
   */
  trackComponents?: boolean | string[];

  /** How long to wait until the tracked root activity is marked as finished and sent of to Sentry */
  timeout?: number;
  /**
   * List of hooks to keep track of during component lifecycle.
   * Available hooks: 'activate' | 'create' | 'destroy' | 'mount' | 'update'
   * Based on https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
   */
  hooks?: Operation[];
}

/**
 * Used to extract BrowserTracing integration from @sentry/tracing
 */
const BROWSER_TRACING_GETTER = ({
  id: 'BrowserTracing',
} as any) as IntegrationClass<Integration>;

/** Global Vue object limited to the methods/attributes we require */
interface VueInstance {
  config: {
    errorHandler?(error: Error, vm?: ViewModel, info?: string): void;
  };
  util?: {
    warn(...input: any): void;
  };
  mixin(hooks: { [key: string]: () => void }): void;
}

/** Representation of Vue component internals */
interface ViewModel {
  [key: string]: any;
  // eslint-disable-next-line @typescript-eslint/ban-types
  $root: object;
  $options: {
    [key: string]: any;
    name?: string;
    propsData?: { [key: string]: any };
    _componentTag?: string;
    __file?: string;
    $_sentryPerfHook?: boolean;
  };
  $once(hook: string, cb: () => void): void;
}

/** Optional metadata attached to Sentry Event */
interface Metadata {
  [key: string]: any;
  componentName?: string;
  propsData?: { [key: string]: any };
  lifecycleHook?: string;
}

// https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
type Hook =
  | 'activated'
  | 'beforeCreate'
  | 'beforeDestroy'
  | 'beforeMount'
  | 'beforeUpdate'
  | 'created'
  | 'deactivated'
  | 'destroyed'
  | 'mounted'
  | 'updated';

type Operation = 'activate' | 'create' | 'destroy' | 'mount' | 'update';

// Mappings from operation to corresponding lifecycle hook.
const HOOKS: { [key in Operation]: Hook[] } = {
  activate: ['activated', 'deactivated'],
  create: ['beforeCreate', 'created'],
  destroy: ['beforeDestroy', 'destroyed'],
  mount: ['beforeMount', 'mounted'],
  update: ['beforeUpdate', 'updated'],
};

const COMPONENT_NAME_REGEXP = /(?:^|[-_/])(\w)/g;
const ROOT_COMPONENT_NAME = 'root';
const ANONYMOUS_COMPONENT_NAME = 'anonymous component';

/**
 * Inits the Vue SDK
 */
export function init(options: VueOptions = {}): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }
  if (options.release === undefined) {
    const window = getGlobalObject<Window>();
    // This supports the variable that sentry-webpack-plugin injects
    if (window.SENTRY_RELEASE && window.SENTRY_RELEASE.id) {
      options.release = window.SENTRY_RELEASE.id;
    }
  }
  initAndBind(BrowserClient, options);
}
