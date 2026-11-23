import { createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { stringifyForCodeInjection } from '@sentry/core';
import type { Plugin } from 'rollup';
import { skipDatabaseInstrumentation } from './databaseConfig';
import { isCloudflarePreset } from './utils';

const WRAPPED_ENTRY_ID = '\0sentry-cloudflare-entry';
const ORIGINAL_ENTRY_QUERY = '?sentry-cloudflare-original';
// The Durable Object class that the Cloudflare presets of Nitro export from the Worker entry.
const NITRO_DURABLE_OBJECT = '$DurableObject';

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * On a Cloudflare preset, wraps the Nitro Worker entry with `withSentry` of `@sentry/cloudflare`, which gets its
 * options from the default export of `optionsFile`, and names the transaction of each request. It also wraps the
 * Durable Object that Nitro exports with `instrumentDurableObjectWithSentry`, and turns off a
 * `sentryCloudflareNitroPlugin` of the app.
 */
export function setupCloudflareEntry(nuxt: Nuxt, optionsFile: string): void {
  nuxt.hook('nitro:init', nitro => {
    if (nuxt.options._prepare || !isCloudflarePreset(nitro.options.preset)) {
      return;
    }

    nitro.options.rollupConfig ??= { output: {} };

    if (nitro.options.rollupConfig.plugins === null || nitro.options.rollupConfig.plugins === undefined) {
      nitro.options.rollupConfig.plugins = [];
    } else if (!Array.isArray(nitro.options.rollupConfig.plugins)) {
      nitro.options.rollupConfig.plugins = [nitro.options.rollupConfig.plugins];
    }

    nitro.options.rollupConfig.plugins.push(wrapCloudflareEntryWithSentry(nitro.options.entry, optionsFile));
    // Nitro runs its plugins in this order. This plugin must run first, because it tells a
    // `sentryCloudflareNitroPlugin` of the app that `withSentry` already wraps each request.
    const entryPlugin = createResolver(import.meta.url).resolve('./runtime/plugins/cloudflare-entry.server');
    nitro.options.plugins.unshift(entryPlugin);
    // Nitro builds the prerenderer from the config of the app, which does not have the changes of this hook.
    nitro.hooks.hook('prerender:config', prerenderConfig => {
      prerenderConfig.plugins = [entryPlugin, ...(prerenderConfig.plugins ?? [])];
    });
    // db0 reads the D1 bindings from the instrumented `env`: Nitro 2 from `globalThis.__env__`, and Nitro 3 from the
    // `env` of `cloudflare:workers`, which the wrapped entry sets. So the db0 instrumentation would add a second span
    // for each D1 query.
    skipDatabaseInstrumentation(nitro, 'cloudflare-d1');
  });
}

/**
 * A Rollup plugin that replaces the Nitro Worker entry with a module that exports its default export and its
 * `$DurableObject` export wrapped by `runtime/utils/wrapCloudflareEntry`, with the options that `optionsFile`
 * returns, and all its other exports unchanged.
 *
 * Only exported for testing.
 */
export function wrapCloudflareEntryWithSentry(entry: string, optionsFile: string): Plugin {
  let hasDurableObject = false;
  let hasDefaultExport = true;

  const wrapperModule = createResolver(import.meta.url).resolve('./runtime/utils/wrapCloudflareEntry');

  function getWrappedEntryCode(originalEntry: string): string {
    const lines = [
      `import { wrapNitroCloudflareEntryWithSentry } from ${stringifyForCodeInjection(wrapperModule)};`,
      `import userOptions from ${stringifyForCodeInjection(optionsFile)};`,
      `import handler from ${stringifyForCodeInjection(originalEntry)};`,
      `export * from ${stringifyForCodeInjection(originalEntry)};`,
      'export default wrapNitroCloudflareEntryWithSentry(userOptions, handler);',
    ];

    // The local export takes precedence over the same name of `export *`.
    if (hasDurableObject) {
      lines.push(
        `import { wrapNitroDurableObjectWithSentry } from ${stringifyForCodeInjection(wrapperModule)};`,
        `import { ${NITRO_DURABLE_OBJECT} as NitroDurableObject } from ${stringifyForCodeInjection(originalEntry)};`,
        `export const ${NITRO_DURABLE_OBJECT} = wrapNitroDurableObjectWithSentry(userOptions, NitroDurableObject);`,
      );
    }

    return lines.join('\n');
  }

  return {
    name: 'sentry-nuxt-cloudflare-entry',
    async resolveId(source, importer, options) {
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
        hasDefaultExport = false;
        this.warn(`[Sentry] The Nitro entry has no default export, so Sentry cannot wrap it with \`withSentry\`.`);
        return null;
      }

      hasDurableObject = moduleInfo.exports.includes(NITRO_DURABLE_OBJECT);
      return WRAPPED_ENTRY_ID;
    },
    load(id) {
      return id === WRAPPED_ENTRY_ID ? getWrappedEntryCode(entry) : null;
    },
    // The Vite builder of Nitro 3 resolves the entry before it asks this plugin, so `resolveId` cannot replace the
    // entry there. Then this hook replaces the code of the entry module. The new code imports the original code from
    // the same file with a query, which Vite loads as a second module.
    transform(code, id) {
      if (
        !hasDefaultExport ||
        !this.getModuleInfo(id)?.isEntry ||
        normalizePath(id).replace(JS_EXTENSION_REGEX, '') !== normalizePath(entry).replace(JS_EXTENSION_REGEX, '')
      ) {
        return null;
      }

      const exportedNames = getExportedNames(this.parse(code).body as ExportNode[]);
      if (!exportedNames.has('default')) {
        this.warn(`[Sentry] The Nitro entry has no default export, so Sentry cannot wrap it with \`withSentry\`.`);
        return null;
      }

      hasDurableObject = exportedNames.has(NITRO_DURABLE_OBJECT);
      return { code: getWrappedEntryCode(`${id}${ORIGINAL_ENTRY_QUERY}`), map: { mappings: '' } };
    },
  };
}

const JS_EXTENSION_REGEX = /\.[cm]?[jt]s$/;

type ExportNode = {
  type: string;
  declaration?: { id?: { name?: string }; declarations?: { id?: { name?: string } }[] } | null;
  specifiers?: { exported?: { name?: string; value?: unknown } }[];
};

function getExportedNames(programBody: ExportNode[]): Set<unknown> {
  const names = new Set<unknown>();

  for (const node of programBody) {
    if (node.type === 'ExportDefaultDeclaration') {
      names.add('default');
    } else if (node.type === 'ExportNamedDeclaration') {
      names.add(node.declaration?.id?.name);
      node.declaration?.declarations?.forEach(declaration => names.add(declaration.id?.name));
      node.specifiers?.forEach(specifier => names.add(specifier.exported?.name ?? specifier.exported?.value));
    }
  }

  return names;
}
