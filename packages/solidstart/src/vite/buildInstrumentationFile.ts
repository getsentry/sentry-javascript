import * as fs from 'fs';
import * as path from 'path';
import { consoleSandbox } from '@sentry/utils';
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
      const build = config.build || {};
      const rollupOptions = build.rollupOptions || {};
      const input = [...((rollupOptions.input || []) as string[])];

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
          rollupOptions: {
            ...rollupOptions,
            input,
          },
        },
      };
    },
  };
}
