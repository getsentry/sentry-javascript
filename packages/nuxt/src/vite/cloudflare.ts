import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/core';
import type { Plugin } from 'rollup';
import { skipDatabaseInstrumentation } from './databaseConfig';
import { isCloudflarePreset, type ServerApi } from './utils';

const WRAPPED_ENTRY_ID = '\0sentry-cloudflare-entry';
// The Durable Object class that the `cloudflare_durable` preset of Nitro exports from the Worker entry.
const NITRO_DURABLE_OBJECT = '$DurableObject';

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * On a Cloudflare preset, wraps the Nitro Worker entry with `withSentry` of `@sentry/cloudflare`, which gets its
 * options from the default export of `optionsFile`, and names the transaction of each request. It also wraps the
 * Durable Object of the `cloudflare_durable` preset with `instrumentDurableObjectWithSentry`.
 */
export function setupCloudflareEntry(nuxt: Nuxt, serverApi: ServerApi, optionsFile: string): void {
  nuxt.hook('nitro:init', nitro => {
    if (nuxt.options._prepare || !isCloudflarePreset(nitro.options.preset)) {
      return;
    }

    if (serverApi !== 'nitro2') {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] Found \`${basename(optionsFile)}\`, but Sentry can set up Cloudflare from this file only with Nitro 2.`,
        );
      });
      return;
    }

    nitro.options.rollupConfig ??= { output: {} };

    if (nitro.options.rollupConfig.plugins === null || nitro.options.rollupConfig.plugins === undefined) {
      nitro.options.rollupConfig.plugins = [];
    } else if (!Array.isArray(nitro.options.rollupConfig.plugins)) {
      nitro.options.rollupConfig.plugins = [nitro.options.rollupConfig.plugins];
    }

    nitro.options.rollupConfig.plugins.push(wrapCloudflareEntryWithSentry(nitro.options.entry, optionsFile));
    nitro.options.plugins.push(
      createResolver(import.meta.url).resolve('./runtime/plugins/transaction-name-cloudflare.server'),
    );
    // `withSentry` instruments the D1 bindings of `env`, so the db0 instrumentation would add a second span for each
    // D1 query.
    skipDatabaseInstrumentation(nitro, 'cloudflare-d1');
  });
}

/**
 * A Rollup plugin that replaces the Nitro Worker entry with a module that exports its default export wrapped with
 * `withSentry`, its `$DurableObject` export wrapped with `instrumentDurableObjectWithSentry`, and all its other exports
 * unchanged.
 *
 * Only exported for testing.
 */
export function wrapCloudflareEntryWithSentry(entry: string, optionsFile: string): Plugin {
  let hasDurableObject = false;

  return {
    name: 'sentry-nuxt-cloudflare-entry',
    async resolveId(source, importer, options) {
      // The app does not have to depend on `@sentry/cloudflare` itself, so resolve it from this package.
      if (importer === WRAPPED_ENTRY_ID && source === '@sentry/cloudflare') {
        return this.resolve(source, fileURLToPath(import.meta.url), { ...options, skipSelf: true });
      }

      // Nitro passes its entry, a path without a file extension, as the Rollup input.
      if (!options.isEntry || normalizePath(source) !== normalizePath(entry)) {
        return null;
      }

      const resolution = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolution || resolution.external) {
        return null;
      }

      // The `cloudflare` (service worker) preset registers a `fetch` listener and has no default export.
      const moduleInfo = await this.load(resolution);
      if (!moduleInfo.exports?.includes('default')) {
        this.warn(`[Sentry] The Nitro entry has no default export, so Sentry cannot wrap it with \`withSentry\`.`);
        return null;
      }

      hasDurableObject = moduleInfo.exports.includes(NITRO_DURABLE_OBJECT);
      return WRAPPED_ENTRY_ID;
    },
    load(id) {
      if (id !== WRAPPED_ENTRY_ID) {
        return null;
      }

      const lines = [
        "import { withSentry } from '@sentry/cloudflare';",
        `import sentryOptions from ${JSON.stringify(optionsFile)};`,
        `import handler from ${JSON.stringify(entry)};`,
        `export * from ${JSON.stringify(entry)};`,
        'export default withSentry(sentryOptions, handler);',
      ];

      // The local export takes precedence over the same name of `export *`.
      if (hasDurableObject) {
        lines.push(
          "import { instrumentDurableObjectWithSentry } from '@sentry/cloudflare';",
          `import { ${NITRO_DURABLE_OBJECT} as NitroDurableObject } from ${JSON.stringify(entry)};`,
          `export const ${NITRO_DURABLE_OBJECT} = instrumentDurableObjectWithSentry(sentryOptions, NitroDurableObject);`,
        );
      }

      return lines.join('\n');
    },
  };
}
