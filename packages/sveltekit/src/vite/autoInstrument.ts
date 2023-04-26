/* eslint-disable @sentry-internal/sdk/no-optional-chaining */
import type {
  ExportNamedDeclaration,
  FunctionDeclaration,
  Program,
  VariableDeclaration,
  VariableDeclarator,
} from '@babel/types';
import type { ProxifiedModule } from 'magicast';
import { builders, generateCode, parseModule } from 'magicast';
import type { Plugin } from 'vite';

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
 * specified in @param options
 *
 * @returns the plugin
 */
export async function makeAutoInstrumentationPlugin(options: AutoInstrumentPluginOptions): Promise<Plugin> {
  const { load: shouldWrapLoad, serverLoad: shouldWrapServerLoad, debug } = options;

  return {
    name: 'sentry-auto-instrumentation',
    enforce: 'post',
    async transform(userCode, id) {
      const shouldApplyUniversalLoadWrapper =
        shouldWrapLoad &&
        /\+(page|layout)\.(js|ts|mjs|mts)$/.test(id) &&
        // Simple check to see if users already instrumented the file manually
        !userCode.includes('@sentry/sveltekit');

      if (shouldApplyUniversalLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log('[Sentry] Applying universal load wrapper to', id);
        const wrappedCode = wrapLoad(userCode, 'wrapLoadWithSentry');
        return { code: wrappedCode, map: null };
      }

      const shouldApplyServerLoadWrapper =
        shouldWrapServerLoad &&
        /\+(page|layout)\.server\.(js|ts|mjs|mts)$/.test(id) &&
        !userCode.includes('@sentry/sveltekit');

      if (shouldApplyServerLoadWrapper) {
        // eslint-disable-next-line no-console
        debug && console.log('[Sentry] Applying server load wrapper to', id);
        const wrappedCode = wrapLoad(userCode, 'wrapServerLoadWithSentry');
        return { code: wrappedCode, map: null };
      }

      return null;
    },
  };
}

/**
 * Applies the wrapLoadWithSentry wrapper to the user's load functions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapLoad(
  userCode: Readonly<string>,
  wrapperFunction: 'wrapLoadWithSentry' | 'wrapServerLoadWithSentry',
): string {
  const mod = parseModule(userCode);

  const modAST = mod.exports.$ast as Program;
  const namedExports = modAST.body.filter(
    (node): node is ExportNamedDeclaration => node.type === 'ExportNamedDeclaration',
  );

  let wrappedSucessfully = false;
  namedExports.forEach(modExport => {
    const declaration = modExport.declaration;
    if (!declaration) {
      return;
    }
    if (declaration.type === 'FunctionDeclaration') {
      if (!declaration.id || declaration.id.name !== 'load') {
        return;
      }
      const declarationCode = generateCode(declaration).code;
      mod.exports.load = builders.raw(`${wrapperFunction}(${declarationCode.replace('load', '_load')})`);
      // because of an issue with magicast, we need to remove the original export
      modAST.body = modAST.body.filter(node => node !== modExport);
      wrappedSucessfully = true;
    } else if (declaration.type === 'VariableDeclaration') {
      declaration.declarations.forEach(declarator => {
        wrappedSucessfully = wrapDeclarator(declarator, wrapperFunction);
      });
    }
  });

  if (wrappedSucessfully) {
    return generateFinalCode(mod, wrapperFunction);
  }

  // If we're here, we know that we didn't find a directly exported `load` function yet.
  // We need to look for it in the top level declarations in case it's declared and exported separately.
  // First case: top level variable declaration
  const topLevelVariableDeclarations = modAST.body.filter(
    (statement): statement is VariableDeclaration => statement.type === 'VariableDeclaration',
  );

  topLevelVariableDeclarations.forEach(declaration => {
    declaration.declarations.forEach(declarator => {
      wrappedSucessfully = wrapDeclarator(declarator, wrapperFunction);
    });
  });

  if (wrappedSucessfully) {
    return generateFinalCode(mod, wrapperFunction);
  }

  // Second case: top level function declaration
  // This is the most intrusive modification, as we need to replace a top level function declaration with a
  // variable declaration and a function assignment. This changes the spacing formatting of the declarations
  // but the line numbers should stay the same
  const topLevelFunctionDeclarations = modAST.body.filter(
    (statement): statement is FunctionDeclaration => statement.type === 'FunctionDeclaration',
  );

  topLevelFunctionDeclarations.forEach(declaration => {
    if (!declaration.id || declaration.id.name !== 'load') {
      return;
    }

    const stmtIndex = modAST.body.indexOf(declaration);
    const declarationCode = generateCode(declaration).code;
    const wrappedFunctionBody = builders.raw(`${wrapperFunction}(${declarationCode.replace('load', '_load')})`);
    const stringifiedFunctionBody = generateCode(wrappedFunctionBody, {}).code;

    const tmpMod = parseModule(`const load = ${stringifiedFunctionBody}`);
    const newDeclarationNode = (tmpMod.$ast as Program).body[0];
    const nodeWithAdjustedLoc = {
      ...newDeclarationNode,
      loc: {
        ...declaration.loc,
      },
    };

    // @ts-ignore - this works, magicast can handle this assignement although the types disagree
    modAST.body[stmtIndex] = nodeWithAdjustedLoc;
    wrappedSucessfully = true;
  });

  if (wrappedSucessfully) {
    return generateFinalCode(mod, wrapperFunction);
  }

  // nothing found, so we just return the original code
  return userCode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateFinalCode(mod: ProxifiedModule<any>, wrapperFunction: string): string {
  const { code } = generateCode(mod);
  return `import { ${wrapperFunction} } from '@sentry/sveltekit'; ${code}`;
}

function wrapDeclarator(declarator: VariableDeclarator, wrapperFunction: string): boolean {
  // @ts-ignore - id should always have a name in this case
  if (!declarator.id || declarator.id.name !== 'load') {
    return false;
  }
  const declarationInitCode = declarator.init;
  // @ts-ignore - we can just place a string here, magicast will convert it to a node
  const stringifiedCode = generateCode(declarationInitCode).code;
  // @ts-ignore - we can just place a string here, magicast will convert it to a node
  declarator.init = `${wrapperFunction}(${stringifiedCode})`;
  return true;
}
