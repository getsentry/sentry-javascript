import { consoleSandbox } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, UserConfig } from 'vite';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * A Sentry plugin for SolidStart to build the server
 * `instrument.server.ts` file.
 */
export function makeBuildInstrumentationFilePlugin(options: SentrySolidStartPluginOptions = {}): Plugin {
  return {
    name: 'sentry-solidstart-build-instrumentation-file',
    apply: 'build',
    enforce: 'post',
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
          // eslint-disable-next-line no-console
          console.warn(
            `[Sentry SolidStart Plugin] Could not access \`${instrumentationFilePath}\`, please make sure it exists.`,
            error,
          );
        });
        return config;
      }

      input.push(path.resolve(router.root, instrumentationFilePath));

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
