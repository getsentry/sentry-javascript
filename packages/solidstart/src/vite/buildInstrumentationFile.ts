import { consoleSandbox, stringifyForCodeInjection } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, UserConfig } from 'vite';
import { TUNNEL_BASE_PATH_GLOBAL } from '../common/tunnel';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * A Sentry plugin for SolidStart to build the server
 * `instrument.server.ts` file.
 */
export function makeBuildInstrumentationFilePlugin(options: SentrySolidStartPluginOptions = {}, basePath = ''): Plugin {
  let instrumentationFile: string | undefined;

  return {
    name: 'sentry-solidstart-build-instrumentation-file',
    apply: 'build',
    enforce: 'post',
    // `node --import` loads this file before the server bundle, so the file sets the base path for `Sentry.init` itself.
    banner(chunk) {
      // Vite reports module IDs with forward slashes, also on Windows.
      const isInstrumentationFile =
        !!chunk.facadeModuleId && path.resolve(chunk.facadeModuleId) === instrumentationFile;
      return basePath && isInstrumentationFile
        ? `globalThis.${TUNNEL_BASE_PATH_GLOBAL} = ${stringifyForCodeInjection(basePath)};`
        : '';
    },
    async config(config: UserConfig, { command }) {
      const instrumentationFilePath = options.instrumentation || './src/instrument.server.ts';
      const router = (config as UserConfig & { router: { target: string; name: string; root: string } }).router;
      // `rollupOptions` is a deprecated alias of `rolldownOptions` in Vite 8+, but the only option in older Vite.
      // Returning both makes Vite 8 ignore `rollupOptions`, so only write back the one that is in use.
      // oxlint-disable-next-line typescript/no-deprecated
      const { rollupOptions, rolldownOptions, ...build } = config.build || {};
      const bundlerOptionsKey = rolldownOptions ? 'rolldownOptions' : 'rollupOptions';
      const bundlerOptions = rolldownOptions || rollupOptions || {};
      const input = [...((bundlerOptions.input || []) as string[])];

      // plugin runs for client, server and sever-fns, we only want to run it for the server once.
      if (command !== 'build' || router.target !== 'server' || router.name === 'server-fns') {
        return config;
      }

      try {
        await fs.promises.access(instrumentationFilePath, fs.constants.F_OK);
      } catch (error) {
        consoleSandbox(() => {
          console.warn(
            `[Sentry SolidStart Plugin] Could not access \`${instrumentationFilePath}\`, please make sure it exists.`,
            error,
          );
        });
        return config;
      }

      instrumentationFile = path.resolve(router.root, instrumentationFilePath);
      input.push(instrumentationFile);

      return {
        ...config,
        build: {
          ...build,
          [bundlerOptionsKey]: {
            ...bundlerOptions,
            input,
          },
        },
      };
    },
  };
}
