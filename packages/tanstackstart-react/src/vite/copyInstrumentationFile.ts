import { consoleSandbox } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Creates a Vite plugin that copies the user's instrumentation file
 * to the server build output directory after the build completes.
 *
 * By default, copies `instrument.server.mjs` from the project root.
 * A custom file path can be provided via `instrumentationFilePath`.
 *
 * Supports:
 * - Nitro deployments (reads output dir from the Nitro Vite environment config)
 * - Cloudflare/Netlify deployments (outputs to `dist/server`)
 */
export function makeCopyInstrumentationFilePlugin(instrumentationFilePath?: string): Plugin {
  let serverOutputDir: string | undefined;
  type RollupOutputDir = { dir?: string } | Array<{ dir?: string }>;
  type ViteEnvironments = Record<string, { build?: { rollupOptions?: { output?: RollupOutputDir } } }>;

  return {
    name: 'sentry-tanstackstart-copy-instrumentation-file',
    apply: 'build',
    enforce: 'post',

    configResolved(resolvedConfig: ResolvedConfig) {
      const plugins = resolvedConfig.plugins || [];
      const hasPlugin = (name: string): boolean => plugins.some(p => p.name?.includes(name));
      console.log('plugins', plugins);

      if (hasPlugin('nitro')) {
        // Nitro case: read server dir from the nitro environment config
        console.log('resolvedConfig', resolvedConfig);
        const environments = (resolvedConfig as { environments?: ViteEnvironments }).environments;
        const nitroEnv = environments?.nitro;
        if (nitroEnv) {
          const rollupOutput = nitroEnv.build?.rollupOptions?.output;
          const dir = Array.isArray(rollupOutput) ? rollupOutput[0]?.dir : rollupOutput?.dir;
          if (dir) {
            serverOutputDir = dir;
          }
        }
      } else if (hasPlugin('cloudflare') || hasPlugin('netlify')) {
        serverOutputDir = path.resolve(resolvedConfig.root, 'dist', 'server');
      } else {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            '[Sentry TanStack Start] Could not detect nitro, cloudflare, or netlify vite plugin. ' +
              'The instrument.server.mjs file will not be copied to the build output automatically.',
          );
        });
      }
    },

    async closeBundle() {
      if (!serverOutputDir) {
        return;
      }

      const instrumentationFileName = instrumentationFilePath || 'instrument.server.mjs';
      const instrumentationSource = path.resolve(process.cwd(), instrumentationFileName);

      try {
        await fs.promises.access(instrumentationSource, fs.constants.F_OK);
      } catch {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            `[Sentry TanStack Start] No ${instrumentationFileName} file found in project root. ` +
              'The Sentry instrumentation file will not be copied to the build output.',
          );
        });
        return;
      }

      const destinationFileName = path.basename(instrumentationFileName);
      const destination = path.resolve(serverOutputDir, destinationFileName);

      try {
        await fs.promises.mkdir(serverOutputDir, { recursive: true });
        await fs.promises.copyFile(instrumentationSource, destination);
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.log(`[Sentry TanStack Start] Copied ${destinationFileName} to ${destination}`);
        });
      } catch (error) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(`[Sentry TanStack Start] Failed to copy ${destinationFileName} to build output.`, error);
        });
      }
    },
  };
}
