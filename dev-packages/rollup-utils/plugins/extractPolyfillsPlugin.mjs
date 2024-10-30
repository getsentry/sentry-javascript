import * as path from 'path';

import * as acorn from 'acorn';
import * as recast from 'recast';

const POLYFILL_NAMES = new Set([
  '_asyncNullishCoalesce',
  '_asyncOptionalChain',
  '_asyncOptionalChainDelete',
  '_nullishCoalesce',
  '_optionalChain',
  '_optionalChainDelete',
]);

/**
 * Create a plugin which will replace function definitions of any of the above functions with an `import` or `require`
 * statement pulling them in from a central source. Mimics tsc's `importHelpers` option.
 */
export function makeExtractPolyfillsPlugin() {
  let moduleFormat;

  // For more on the hooks used in this plugin, see https://rollupjs.org/guide/en/#output-generation-hooks
  return {
    name: 'extractPolyfills',

    // Figure out which build we're currently in (esm or cjs)
    outputOptions(options) {
      moduleFormat = options.format;
    },

    // This runs after both the sucrase transpilation (which happens in the `transform` hook) and rollup's own
    // esm-i-fying or cjs-i-fying work (which happens right before `renderChunk`), in other words, after all polyfills
    // will have been injected
    renderChunk(code, chunk) {
      const sourceFile = chunk.fileName;

      // We don't want to pull the function definitions out of their actual sourcefiles, just the places where they've
      // been injected
      if (sourceFile.includes('buildPolyfills')) {
        return null;
      }

      // The index.js file of the utils package will include identifiers named after polyfills so we would inject the
      // polyfills, however that would override the exports so we should just skip that file.
      const isUtilsPackage = process.cwd().endsWith(`packages${path.sep}utils`);
      if (isUtilsPackage && sourceFile === 'index.js') {
        return null;
      }

      const parserOptions = {
        sourceFileName: sourceFile,
        // We supply a custom parser which wraps the provided `acorn` parser in order to override the `ecmaVersion` value.
        // See https://github.com/benjamn/recast/issues/578.
        parser: {
          parse(source, options) {
            return acorn.parse(source, {
              ...options,
              // By this point in the build, everything should already have been down-compiled to whatever JS version
              // we're targeting. Setting this parser to `latest` just means that whatever that version is (or changes
              // to in the future), this parser will be able to handle the generated code.
              ecmaVersion: 'latest',
            });
          },
        },
      };

      const ast = recast.parse(code, parserOptions);

      // Find function definitions and function expressions whose identifiers match a known polyfill name
      const polyfillNodes = findPolyfillNodes(ast);

      if (polyfillNodes.length === 0) {
        return null;
      }

      console.log(`${sourceFile} - polyfills: ${polyfillNodes.map(node => node.name)}`);

      // Depending on the output format, generate `import { x, y, z } from '...'` or `var { x, y, z } = require('...')`
      const importOrRequireNode = createImportOrRequireNode(polyfillNodes, sourceFile, moduleFormat);

      // Insert our new `import` or `require` node at the top of the file, and then delete the function definitions it's
      // meant to replace (polyfill nodes get marked for deletion in `findPolyfillNodes`)
      ast.program.body = [importOrRequireNode, ...ast.program.body.filter(node => !node.shouldDelete)];

      // In spite of the name, this doesn't actually print anything - it just stringifies the code, and keeps track of
      // where original nodes end up in order to generate a sourcemap.
      const result = recast.print(ast, {
        sourceMapName: `${sourceFile}.map`,
        quote: 'single',
      });

      return { code: result.code, map: result.map };
    },
  };
}

/**
 * Extract the function name, regardless of the format in which the function is declared
 */
function getNodeName(node) {
  // Function expressions and functions pulled from objects
  if (node.type === 'VariableDeclaration') {
    // In practice sucrase and rollup only ever declare one polyfill at a time, so it's safe to just grab the first
    // entry here
    const declarationId = node.declarations[0].id;

    // Note: Sucrase and rollup seem to only use the first type of variable declaration for their polyfills, but good to
    // cover our bases

    // Declarations of the form
    //   `const dogs = function() { return "are great"; };`
    // or
    //   `const dogs = () => "are great";
    if (declarationId.type === 'Identifier') {
      return declarationId.name;
    }
    // Declarations of the form
    //   `const { dogs } = { dogs: function() { return "are great"; } }`
    // or
    //   `const { dogs } = { dogs: () => "are great" }`
    else if (declarationId.type === 'ObjectPattern') {
      return declarationId.properties[0].key.name;
    }
    // Any other format
    else {
      return 'unknown variable';
    }
  }

  // Regular old functions, of the form
  //   `function dogs() { return "are great"; }`
  else if (node.type === 'FunctionDeclaration') {
    return node.id.name;
  }

  // If we get here, this isn't a node we're interested in, so just return a string we know will never match any of the
  // polyfill names
  else {
    return 'nope';
  }
}

/**
 * Find all nodes whose identifiers match a known polyfill name.
 *
 * Note: In theory, this could yield false positives, if any of the magic names were assigned to something other than a
 * polyfill function, but the chances of that are slim. Also, it only searches the module global scope, but that's
 * always where the polyfills appear, so no reason to traverse the whole tree.
 */
function findPolyfillNodes(ast) {
  const isPolyfillNode = node => {
    const nodeName = getNodeName(node);
    if (POLYFILL_NAMES.has(nodeName)) {
      // Mark this node for later deletion, since we're going to replace it with an import statement
      node.shouldDelete = true;
      // Store the name in a consistent spot, regardless of node type
      node.name = nodeName;

      return true;
    }

    return false;
  };

  return ast.program.body.filter(isPolyfillNode);
}

/**
 * Create a node representing an `import` or `require` statement of the form
 *
 *     import { < polyfills > } from '...'
 * or
 *     var { < polyfills > } = require('...')
 *
 * @param polyfillNodes The nodes from the current version of the code, defining the polyfill functions
 * @param currentSourceFile The path, relative to `src/`, of the file currently being transpiled
 * @param moduleFormat Either 'cjs' or 'esm'
 * @returns A single node which can be subbed in for the polyfill definition nodes
 */
function createImportOrRequireNode(polyfillNodes, currentSourceFile, moduleFormat) {
  const {
    callExpression,
    identifier,
    importDeclaration,
    importSpecifier,
    literal,
    objectPattern,
    property,
    variableDeclaration,
    variableDeclarator,
  } = recast.types.builders;

  // Since our polyfills live in `@sentry/utils`, if we're importing or requiring them there the path will have to be
  // relative
  const isUtilsPackage = process.cwd().endsWith(path.join('packages', 'utils'));
  const importSource = literal(
    isUtilsPackage
      ? `.${path.sep}${path.relative(path.dirname(currentSourceFile), 'buildPolyfills')}`
      : '@sentry/utils',
  );

  // This is the `x, y, z` of inside of `import { x, y, z }` or `var { x, y, z }`
  const importees = polyfillNodes.map(({ name: fnName }) =>
    moduleFormat === 'esm'
      ? importSpecifier(identifier(fnName))
      : property.from({ kind: 'init', key: identifier(fnName), value: identifier(fnName), shorthand: true }),
  );

  const requireFn = identifier('require');

  return moduleFormat === 'esm'
    ? importDeclaration(importees, importSource)
    : variableDeclaration('var', [
        variableDeclarator(objectPattern(importees), callExpression(requireFn, [importSource])),
      ]);
}
