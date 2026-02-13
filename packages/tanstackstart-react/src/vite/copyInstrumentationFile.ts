import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';

interface CopyInstrumentationFilePluginOptions {
  instrumentationFilePath?: string;
  serverOutputDir?: string;
}

/**
 * Creates a Vite plugin that copies the user's instrumentation file
 * to the server build output directory after the build completes.
 *
 * By default, copies `instrument.server.mjs` from the project root.
 * A custom file path can be provided via `instrumentationFilePath`.
 *
 * The server output directory can be configured via `serverOutputDir`.
 * By default, it will be auto-detected based on the vite plugin being used.
 *
 * For nitro deployments, we use the Nitro Vite environment config to get the server output directory.
 * For cloudflare and netlify deployments, we assume the server output directory is `dist/server`, which is the default output directory for these plugins.
 */
export function makeCopyInstrumentationFilePlugin(options?: CopyInstrumentationFilePluginOptions): Plugin {
  let serverOutputDir: string | undefined;
  type RollupOutputDir = { dir?: string };
  type ViteEnvironments = Record<string, { build?: { rollupOptions?: { output?: RollupOutputDir } } }>;

  return {
    name: 'sentry-tanstackstart-copy-instrumentation-file',
    apply: 'build',
    enforce: 'post',

    configResolved(resolvedConfig: ResolvedConfig) {
      // If user provided serverOutputDir, use it directly and skip auto-detection
      if (options?.serverOutputDir) {
        serverOutputDir = path.resolve(resolvedConfig.root, options.serverOutputDir);
        return;
      }

      const plugins = resolvedConfig.plugins || [];
      const hasPlugin = (name: string): boolean => plugins.some(p => p.name?.includes(name));

      if (hasPlugin('nitro')) {
        // There seems to be no way to access the nitro instance directly to get the server dir, so we need to access it via the vite environment config.
        // This works because Nitro's Vite bundler sets the rollup output dir to the resolved serverDir:
        // https://github.com/nitrojs/nitro/blob/1954b824597f6ac52fb8b064415cb85d0feda078/src/build/vite/bundler.ts#L35
        const environments = (resolvedConfig as { environments?: ViteEnvironments }).environments;
        const nitroEnv = environments?.nitro;
        if (nitroEnv) {
          const rollupOutput = nitroEnv.build?.rollupOptions?.output;
          const dir = rollupOutput?.dir;
          if (dir) {
            serverOutputDir = dir;
          }
        }
      } else if (hasPlugin('cloudflare') || hasPlugin('netlify')) {
        // There seems to be no way for users to configure the server output dir for these plugins, so we just assume it's `dist/server`, which is the default output dir.
        serverOutputDir = path.resolve(resolvedConfig.root, 'dist', 'server');
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[Sentry] Could not detect nitro, cloudflare, or netlify vite plugin. ' +
            'The instrument.server.mjs file will not be copied to the build output automatically.',
        );
      }
    },

    async closeBundle() {
      // Auto-detection failed, so we don't copy the instrumentation file.
      if (!serverOutputDir) {
        return;
      }

      const instrumentationFileName = options?.instrumentationFilePath || 'instrument.server.mjs';
      const instrumentationSource = path.resolve(process.cwd(), instrumentationFileName);

      // Check if the instrumentation file exists.
      try {
        await fs.promises.access(instrumentationSource);
      } catch {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] No ${instrumentationFileName} file found in project root. ` +
            'The Sentry instrumentation file will not be copied to the build output.',
        );
        return;
      }

      // Copy the instrumentation file to the server output directory.
      const destinationFileName = path.basename(instrumentationFileName);
      const destination = path.resolve(serverOutputDir, destinationFileName);

      try {
        await fs.promises.mkdir(serverOutputDir, { recursive: true });
        await fs.promises.copyFile(instrumentationSource, destination);
        // eslint-disable-next-line no-console
        console.log(`[Sentry] Copied ${destinationFileName} to ${destination}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[Sentry] Failed to copy ${destinationFileName} to build output.`, error);
      }
    },
  };
}
