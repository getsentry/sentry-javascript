import * as fs from 'node:fs';
import * as path from 'node:path';
import { consoleSandbox } from '@sentry/core';
import type { Plugin } from 'vite';

const DEFAULT_FILE_NAMES = [
  'instrument.server.ts',
  'instrument.server.mts',
  'instrument.server.js',
  'instrument.server.mjs',
];
const DEFAULT_DIRECTORIES = ['', 'src'];

const NITRO_PLUGIN_ID = '#sentry/tanstackstart-server-instrumentation';

/** The parts of the Nitro instance that this plugin uses. */
type Nitro = {
  options: {
    dev: boolean;
    preset: string;
    rootDir: string;
    plugins: string[];
    virtual: Record<string, string>;
  };
};

/**
 * Finds the file that calls `Sentry.init()` for the server: `instrument.server.{ts,mts,js,mjs}` in the root or in
 * `src/`.
 */
export function findServerInstrumentationFile(root: string): string | undefined {
  for (const directory of DEFAULT_DIRECTORIES) {
    for (const fileName of DEFAULT_FILE_NAMES) {
      const candidate = path.join(root, directory, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * Loads the server instrumentation file from a Nitro plugin.
 *
 * Nitro imports the server entry lazily, in the first request. Without `node --import`, a `Sentry.init()` imported
 * from the server entry runs too late to trace that request. Nitro plugins run when the server starts.
 */
export function makeServerInstrumentationPlugin({
  serverInstrumentationFile,
  debug,
}: {
  serverInstrumentationFile?: string | false;
  debug?: boolean;
}): Plugin & { nitro: { name: string; setup: (nitro: Nitro) => void } } {
  return {
    name: 'sentry-tanstackstart-server-instrumentation',
    apply: 'build',
    nitro: {
      name: 'sentry-tanstackstart-server-instrumentation',
      setup(nitro) {
        // The Cloudflare SDK sets itself up from the worker entry, so the Node SDK must not end up in the worker.
        if (serverInstrumentationFile === false || nitro.options.dev || isCloudflarePreset(nitro.options.preset)) {
          return;
        }

        const file = serverInstrumentationFile
          ? path.resolve(nitro.options.rootDir, serverInstrumentationFile)
          : findServerInstrumentationFile(nitro.options.rootDir);

        if (!file) {
          return;
        }

        if (serverInstrumentationFile && !fs.existsSync(file)) {
          consoleSandbox(() => {
            // eslint-disable-next-line no-console
            console.warn(
              `[Sentry] Could not find the server instrumentation file \`${serverInstrumentationFile}\`, so the SDK is not initialized when the server starts.`,
            );
          });
          return;
        }

        nitro.options.virtual[NITRO_PLUGIN_ID] = `import ${JSON.stringify(file)};\nexport default () => {};\n`;
        // Before the plugins of the app, so they run with an initialized SDK.
        nitro.options.plugins.unshift(NITRO_PLUGIN_ID);

        if (debug) {
          // eslint-disable-next-line no-console
          console.log(
            `[Sentry] Loading \`${path.relative(nitro.options.rootDir, file)}\` when the Nitro server starts.`,
          );
        }
      },
    },
  };
}

function isCloudflarePreset(preset: string | undefined): boolean {
  return !!preset?.replace(/-/g, '_').startsWith('cloudflare');
}
