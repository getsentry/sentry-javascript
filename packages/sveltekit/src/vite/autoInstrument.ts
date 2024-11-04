import * as fs from 'fs';
import * as path from 'path';
/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import type { ExportNamedDeclaration } from '@babel/types';
import { parseModule } from 'magicast';
import type { Plugin } from 'vite';

export const WRAPPED_MODULE_SUFFIX = '?sentry-auto-wrap';

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

  return {
    name: 'sentry-auto-instrumentation',
    // This plugin needs to run as early as possible, before the SvelteKit plugin virtualizes all paths and ids
    enforce: 'pre',

    async load(id) {
      const applyUniversalLoadWrapper =
        wrapLoadEnabled &&
        /^\+(page|layout)\.(js|ts|mjs|mts)$/.test(path.basename(id)) &&
        (await canWrapLoad(id, debug));

      if (applyUniversalLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log(`Wrapping ${id} with Sentry load wrapper`);
        return getWrapperCode('wrapLoadWithSentry', `${id}${WRAPPED_MODULE_SUFFIX}`);
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

  const mod = parseModule(code);

  const program = mod.$ast.type === 'Program' && mod.$ast;
  if (!program) {
    // eslint-disable-next-line no-console
    debug && console.log(`Skipping wrapping ${id} because it doesn't contain valid JavaScript or TypeScript`);
    return false;
  }

  const hasLoadDeclaration = program.body
    .filter((statement): statement is ExportNamedDeclaration => statement.type === 'ExportNamedDeclaration')
    .find(exportDecl => {
      // find `export const load = ...`
      if (exportDecl.declaration && exportDecl.declaration.type === 'VariableDeclaration') {
        const variableDeclarations = exportDecl.declaration.declarations;
        return variableDeclarations.find(decl => decl.id.type === 'Identifier' && decl.id.name === 'load');
      }

      // find `export function load = ...`
      if (exportDecl.declaration && exportDecl.declaration.type === 'FunctionDeclaration') {
        const functionId = exportDecl.declaration.id;
        return functionId?.name === 'load';
      }

      // find `export { load, somethingElse as load, somethingElse as "load" }`
      if (exportDecl.specifiers) {
        return exportDecl.specifiers.find(specifier => {
          return (
            (specifier.exported.type === 'Identifier' && specifier.exported.name === 'load') ||
            (specifier.exported.type === 'StringLiteral' && specifier.exported.value === 'load')
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
