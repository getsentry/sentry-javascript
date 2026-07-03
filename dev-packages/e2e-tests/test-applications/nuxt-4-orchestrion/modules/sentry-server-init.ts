import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createResolver, defineNuxtModule } from '@nuxt/kit';

const SERVER_CONFIG_FILENAME = 'sentry.server.config';

/**
 * Local demo module — NOT part of `@sentry/nuxt`.
 *
 * The orchestrion bundler approach needs the Sentry init to run inside the
 * server build (so the diagnostics-channel subscribers are registered before
 * the first request) WITHOUT relying on `node --import`.
 */
export default defineNuxtModule({
  meta: { name: 'sentry-server-init' },
  setup(_options, nuxt) {
    nuxt.hooks.hook('nitro:init', nitro => {
      nitro.hooks.hook('close', () => {
        const entryFilePath = createResolver(nitro.options.output.serverDir).resolve('index.mjs');

        if (!existsSync(entryFilePath)) {
          return;
        }

        const topImport = `import './${SERVER_CONFIG_FILENAME}.mjs';\n`;
        const data = readFileSync(entryFilePath, 'utf8');

        if (data.startsWith(topImport)) {
          return;
        }

        writeFileSync(entryFilePath, topImport + data, 'utf8');
      });
    });
  },
});
