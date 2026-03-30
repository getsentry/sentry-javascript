import type { ConfigEnv, Plugin } from 'vite';
import { makeAutoInstrumentRSCPlugin } from './makeAutoInstrumentRSCPlugin';
import { makeConfigInjectorPlugin } from './makeConfigInjectorPlugin';
import { makeCustomSentryVitePlugins } from './makeCustomSentryVitePlugins';
import { makeEnableSourceMapsPlugin } from './makeEnableSourceMapsPlugin';
import { makeServerBuildCapturePlugin } from './makeServerBuildCapturePlugin';
import type { SentryReactRouterBuildOptions } from './types';

/**
 * A Vite plugin for Sentry that handles source map uploads and bundle size optimizations.
 *
 * @param options - Configuration options for the Sentry Vite plugin
 * @param viteConfig - The Vite user config object
 * @returns An array of Vite plugins
 */
export async function sentryReactRouter(
  options: SentryReactRouterBuildOptions = {},
  viteConfig: ConfigEnv,
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  plugins.push(makeConfigInjectorPlugin(options));
  plugins.push(makeServerBuildCapturePlugin());

  if (options.experimental_rscAutoInstrumentation?.enabled === true) {
    plugins.push(makeAutoInstrumentRSCPlugin({ ...options.experimental_rscAutoInstrumentation, debug: options.debug }));
  }

  if (process.env.NODE_ENV !== 'development' && viteConfig.command === 'build' && viteConfig.mode !== 'development') {
    plugins.push(makeEnableSourceMapsPlugin(options));
    plugins.push(...(await makeCustomSentryVitePlugins(options)));
  }

  return plugins;
}
