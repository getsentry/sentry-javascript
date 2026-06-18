import { tsPlugin } from '@sveltejs/acorn-typescript';
import * as acorn from 'acorn';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin } from 'vite';
import { WRAPPED_MODULE_SUFFIX } from '../common/utils';
import type { BackwardsForwardsCompatibleSvelteConfig } from './svelteConfig';

const AcornParser = acorn.Parser.extend(tsPlugin());

export type AutoInstrumentSelection = {
  /**
   * If this flag is `true`, the Sentry plugins will automatically instrument the `load` function of
   * your universal `load` functions declared in your `+page.(js|ts)` and `+layout.(js|ts)` files.
   *
   * @default true
   */
  load?: boolean;

  /**
   * If this flag is `true`, the Sentry plugins will automatically instrument the `load` function of
   * your server-only `load` functions declared in your `+page.server.(js|ts)`
   * and `+layout.server.(js|ts)` files.
   *
   * @default true
   */
  serverLoad?: boolean;
};

type AutoInstrumentPluginOptions = AutoInstrumentSelection & {
  debug: boolean;
  onlyInstrumentClient: boolean;
};

/**
 * Creates a Vite plugin that automatically instruments the parts of the app
 * specified in @param options. This includes
 *
 * - universal `load` functions from `+page.(js|ts)` and `+layout.(js|ts)` files
 * - server-only `load` functions from `+page.server.(js|ts)` and `+layout.server.(js|ts)` files
 *
 * @returns the plugin
 */
export function makeAutoInstrumentationPlugin(options: AutoInstrumentPluginOptions): Plugin {
  const { load: wrapLoadEnabled, serverLoad: wrapServerLoadEnabled, debug } = options;

  let isServerBuild: boolean | undefined = undefined;

  // Whether we should skip server-side load instrumentation because SvelteKit's native server
  // tracing is enabled. Initialized from the option (derived from `svelte.config.js`), but may be
  // flipped to `true` in `configResolved` once we can read SvelteKit's resolved config (see below).
  let onlyInstrumentClient = options.onlyInstrumentClient;

  return {
    name: 'sentry-auto-instrumentation',
    // This plugin needs to run as early as possible, before the SvelteKit plugin virtualizes all paths and ids
    enforce: 'pre',

    configResolved: config => {
      // The SvelteKit plugins trigger additional builds within the main (SSR) build.
      // We just need a mechanism to upload source maps only once.
      // `config.build.ssr` is `true` for that first build and `false` in the other ones.
      // Hence we can use it as a switch to upload source maps only once in main build.
      isServerBuild = !!config.build.ssr;

      // As of SvelteKit 3, the native server-tracing config is no longer read from
      // `svelte.config.js` (so the `onlyInstrumentClient` option, derived from it, is `false`).
      // It's passed to the `sveltekit()` Vite plugin instead, which exposes the resolved config
      // via its plugin `api.options`. Reading it here lets us reliably detect native tracing
      // regardless of SvelteKit version. When it's enabled, we must not add our own server-side
      // load instrumentation, otherwise we'd emit duplicate spans on top of SvelteKit's.
      if (!onlyInstrumentClient && isNativeServerTracingEnabled(config.plugins)) {
        onlyInstrumentClient = true;
      }
    },

    async load(id) {
      // On Vite 6+ `config.build.ssr` captured in `configResolved` no longer reliably reflects the per-environment build.
      // Prefer the environment of the current build (`this.environment.name === 'ssr'`) and fall back to
      // `isServerBuild` for older Vite versions that don't expose environments.
      const environmentName = (this as { environment?: { name?: string } }).environment?.name;
      const isServerEnvironment = environmentName != null ? environmentName === 'ssr' : !!isServerBuild;

      if (onlyInstrumentClient && isServerEnvironment) {
        return null;
      }

      const applyUniversalLoadWrapper =
        wrapLoadEnabled &&
        /^\+(page|layout)\.(js|ts|mjs|mts)$/.test(path.basename(id)) &&
        (await canWrapLoad(id, debug));

      if (applyUniversalLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log(`Wrapping ${id} with Sentry load wrapper`);
        return getWrapperCode('wrapLoadWithSentry', `${id}${WRAPPED_MODULE_SUFFIX}`);
      }

      if (onlyInstrumentClient) {
        // Now that we've checked universal files, we can early return and avoid further
        // regexp checks below for server-only files, in case `onlyInstrumentClient` is `true`.
        return null;
      }

      const applyServerLoadWrapper =
        wrapServerLoadEnabled &&
        /^\+(page|layout)\.server\.(js|ts|mjs|mts)$/.test(path.basename(id)) &&
        (await canWrapLoad(id, debug));

      if (applyServerLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log(`Wrapping ${id} with Sentry load wrapper`);
        return getWrapperCode('wrapServerLoadWithSentry', `${id}${WRAPPED_MODULE_SUFFIX}`);
      }

      return null;
    },
  };
}

/**
 * Detects whether SvelteKit's native server-side tracing is enabled by reading the resolved
 * SvelteKit config that the `sveltekit()` Vite plugin exposes via its plugin `api.options`.
 *
 * This is the source of truth as of SvelteKit 3, where the config moved out of `svelte.config.js`
 * and into the `sveltekit()` plugin. On older SvelteKit versions that don't expose the config this
 * way, it simply returns `false` and we fall back to the `svelte.config.js`-derived value.
 */
function isNativeServerTracingEnabled(plugins: readonly Plugin[] | undefined): boolean {
  if (!plugins) {
    return false;
  }

  for (const plugin of plugins) {
    const options = (plugin?.api as { options?: BackwardsForwardsCompatibleSvelteConfig } | undefined)?.options;
    if (options?.kit?.experimental?.tracing?.server) {
      return true;
    }
  }

  return false;
}

/**
 * We only want to apply our wrapper to files that
 *
 *  - Have no Sentry code yet in them. This is to avoid double-wrapping or interfering with custom
 *    Sentry calls.
 *  - Actually declare a `load` function. The second check of course is not 100% accurate, but it's good enough.
 *    Injecting our wrapper into files that don't declare a `load` function would result in a build-time warning
 *    because vite/rollup warns if we reference an export from the user's file in our wrapping code that
 *    doesn't exist.
 *
 * Exported for testing
 *
 * @returns `true` if we can wrap the given file, `false` otherwise
 */
export async function canWrapLoad(id: string, debug: boolean): Promise<boolean> {
  // Some 3rd party plugins add ids to the build that actually don't exist.
  // We need to check for that here, otherwise users get get a build errors.
  if (!fs.existsSync(id)) {
    debug &&
      // eslint-disable-next-line no-console
      console.log(
        `Skipping wrapping ${id} because it doesn't exist. A 3rd party plugin might have added this as a virtual file to the build`,
      );
    return false;
  }

  const code = (await fs.promises.readFile(id, 'utf8')).toString();

  let program: acorn.Program;
  try {
    program = AcornParser.parse(code, {
      sourceType: 'module',
      ecmaVersion: 'latest',
      locations: true,
    });
  } catch {
    // eslint-disable-next-line no-console
    debug && console.log(`Skipping wrapping ${id} because it doesn't contain valid JavaScript or TypeScript`);
    return false;
  }

  const hasLoadDeclaration = program.body
    .filter((statement): statement is acorn.ExportNamedDeclaration => statement.type === 'ExportNamedDeclaration')
    .find(exportDecl => {
      // find `export const load = ...`
      if (exportDecl.declaration?.type === 'VariableDeclaration') {
        const variableDeclarations = exportDecl.declaration.declarations;
        return variableDeclarations.find(
          decl => decl.type === 'VariableDeclarator' && decl.id.type === 'Identifier' && decl.id.name === 'load',
        );
      }

      // find `export function load = ...`
      if (exportDecl.declaration?.type === 'FunctionDeclaration') {
        const functionId = exportDecl.declaration.id;
        return functionId?.name === 'load';
      }

      // find `export { load, somethingElse as load, somethingElse as "load" }`
      if (exportDecl.specifiers) {
        return exportDecl.specifiers.find(specifier => {
          return (
            (specifier.exported.type === 'Identifier' && specifier.exported.name === 'load') ||
            // ESTree/acorn represents `export { x as "load" }` with a Literal node (not Babel's StringLiteral)
            (specifier.exported.type === 'Literal' && specifier.exported.value === 'load')
          );
        });
      }

      return false;
    });

  if (!hasLoadDeclaration) {
    // eslint-disable-next-line no-console
    debug && console.log(`Skipping wrapping ${id} because it doesn't declare a \`load\` function`);
    return false;
  }

  return true;
}

/**
 * Return wrapper code fo the given module id and wrapping function
 */
function getWrapperCode(
  wrapperFunction: 'wrapLoadWithSentry' | 'wrapServerLoadWithSentry',
  idWithSuffix: string,
): string {
  return (
    `import { ${wrapperFunction} } from "@sentry/sveltekit";` +
    `import * as userModule from ${JSON.stringify(idWithSuffix)};` +
    `export const load = userModule.load ? ${wrapperFunction}(userModule.load) : undefined;` +
    `export * from ${JSON.stringify(idWithSuffix)};`
  );
}
