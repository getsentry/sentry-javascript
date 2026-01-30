import { consoleSandbox } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Creates a Vite plugin that copies the user's `instrument.server.mjs` file
 * to the server build output directory after the build completes.
 *
 * Supports:
 * - Nitro deployments (reads output dir from the Nitro Vite environment config)
 * - Cloudflare/Netlify deployments (outputs to `dist/server`)
 */
export function makeCopyInstrumentationFilePlugin(): Plugin {
  let serverOutputDir: string | undefined;

  return {
    name: 'sentry-tanstackstart-copy-instrumentation-file',
    apply: 'build',
    enforce: 'post',

    configResolved(resolvedConfig: ResolvedConfig) {
      const plugins = resolvedConfig.plugins || [];
      const hasPlugin = (name: string): boolean => plugins.some(p => p.name === name);

      if (hasPlugin('nitro')) {
        // Nitro case: read server dir from the nitro environment config
        // Vite 6 environment configs are not part of the public type definitions yet,
        // so we need to access them via an index signature.
        const environments = (resolvedConfig as Record<string, unknown>)['environments'] as
          | Record<string, { build?: { rollupOptions?: { output?: { dir?: string } | Array<{ dir?: string }> } } }>
          | undefined;
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

      const instrumentationSource = path.resolve(process.cwd(), 'instrument.server.mjs');

      try {
        await fs.promises.access(instrumentationSource, fs.constants.F_OK);
      } catch {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            '[Sentry TanStack Start] No instrument.server.mjs file found in project root. ' +
              'The Sentry instrumentation file will not be copied to the build output.',
          );
        });
        return;
      }

      const destination = path.resolve(serverOutputDir, 'instrument.server.mjs');

      try {
        await fs.promises.mkdir(serverOutputDir, { recursive: true });
        await fs.promises.copyFile(instrumentationSource, destination);
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.log(`[Sentry TanStack Start] Copied instrument.server.mjs to ${destination}`);
        });
      } catch (error) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn('[Sentry TanStack Start] Failed to copy instrument.server.mjs to build output.', error);
        });
      }
    },
  };
}
