import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';

const FILE_NAMES = ['instrument.server.ts', 'instrument.server.mts', 'instrument.server.js', 'instrument.server.mjs'];
const DIRECTORIES = ['', 'src'];

const NITRO_PLUGIN_ID = '#sentry/tanstackstart-server-instrumentation';

/** The parts of the Nitro instance that this plugin uses. */
type Nitro = {
  options: { dev: boolean; preset: string; rootDir: string; plugins: string[]; virtual: Record<string, string> };
};

/** Finds `instrument.server.{ts,mts,js,mjs}` in the project root or in `src/`. */
export function findServerInstrumentationFile(root: string): string | undefined {
  for (const directory of DIRECTORIES) {
    for (const fileName of FILE_NAMES) {
      const file = path.join(root, directory, fileName);
      if (fs.existsSync(file)) {
        return file;
      }
    }
  }
  return undefined;
}

/**
 * Bundles the server instrumentation file into the Nitro build and loads it from a Nitro plugin, which runs when the
 * server starts. Nitro only imports the server entry in the first request, which is too late to trace that request.
 */
export function makeServerInstrumentationPlugin({ debug }: { debug?: boolean }): Plugin & {
  nitro: { name: string; setup: (nitro: Nitro) => void };
} {
  return {
    name: 'sentry-tanstackstart-server-instrumentation',
    apply: 'build',
    nitro: {
      name: 'sentry-tanstackstart-server-instrumentation',
      setup(nitro) {
        // On Cloudflare, the Cloudflare SDK sets itself up, and the Node SDK must not end up in the worker.
        if (nitro.options.dev || isCloudflarePreset(nitro.options.preset)) {
          return;
        }

        const file = findServerInstrumentationFile(nitro.options.rootDir);
        if (!file) {
          return;
        }

        nitro.options.virtual[NITRO_PLUGIN_ID] = `import ${JSON.stringify(file)};\nexport default () => {};\n`;
        // Before the plugins of the app, so they run with an initialized SDK.
        nitro.options.plugins.unshift(NITRO_PLUGIN_ID);

        if (debug) {
          // eslint-disable-next-line no-console
          console.log(
            `[Sentry] Bundled \`${path.relative(nitro.options.rootDir, file)}\` into the Nitro server build. The SDK initializes itself when the server starts, no \`node --import\` needed.`,
          );
        }
      },
    },
  };
}

function isCloudflarePreset(preset: string | undefined): boolean {
  return !!preset?.replace(/-/g, '_').startsWith('cloudflare');
}
