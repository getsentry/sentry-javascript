import { type Plugin } from 'vite';
import type { SentryReactRouterBuildOptions } from './types';

/**
 * Creates a Vite plugin that injects the Sentry options into the global Vite config.
 * This ensures the sentryConfig is available to other components that need access to it,
 * like the buildEnd hook.
 *
 * @param options - Configuration options for the Sentry Vite plugin
 * @returns A Vite plugin that injects sentryConfig into the global config
 */
export function makeConfigInjectorPlugin(options: SentryReactRouterBuildOptions): Plugin {
  return {
    name: 'sentry-react-router-config-injector',
    enforce: 'pre',
    config(config) {
      return {
        ...config,
        sentryConfig: options,
      };
    },
  };
}
