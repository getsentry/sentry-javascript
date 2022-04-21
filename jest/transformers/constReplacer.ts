/**
 * This is a transformer which `ts-jest` applies during the compilation process, which switches all of the `const`s out
 * for `var`s. Unlike in our package builds, where we do the same substiution for bundle size reasons, here we do it
 * because otherwise `const global = getGlobalObject()` throws an error about redifining `global`. (This didn't used to
 * be a problem because our down-compilation did the `const`-`var` substitution for us, but now that we're ES6-only, we
 * have to do it ourselves.)
 *
 * Note: If you ever have to change this, and are testing it locally in the process, be sure to call
 *     `yarn jest --clearCache`
 * before each test run, as transformation results are cached between runs.
 */

import {
  createVariableDeclarationList,
  getCombinedNodeFlags,
  isVariableDeclarationList,
  Node,
  NodeFlags,
  SourceFile,
  TransformationContext,
  Transformer,
  TransformerFactory,
  visitEachChild,
  visitNode,
  VisitResult,
} from 'typescript';

// These can be anything - they're just used to construct a cache key for the transformer returned by the factory below.
// This really only matters when you're testing the transformer itself, as changing these values gives you a quick way
// to invalidate the cache and ensure that changes you've made to the code here are immediately picked up on and used.
export const name = 'const-to-var';
export const version = '1.0';

/**
 * Check whether the given AST node represents a `const` token.
 *
 * This function comes from the TS compiler, and is copied here to get around the fact that it's not exported by the
 * `typescript` package.
 *
 * @param node The node to check
 * @returns A boolean indicating if the node is a `const` token.
 */
function isVarConst(node: Node): boolean {
  // eslint-disable-next-line no-bitwise
  return !!(getCombinedNodeFlags(node) & NodeFlags.Const);
}

/**
 * Return a set of nested factory functions, which ultimately creates an AST-node visitor function, which can modify
 * each visited node as it sees fit, and uses it to walk the AST, returning the results.
 *
 * In our case, we're modifying all `const` variable declarations to use `var` instead.
 */
export function factory(): TransformerFactory<SourceFile> {
  // Create the transformer
  function transformerFactory(context: TransformationContext): Transformer<SourceFile> {
    // Create a visitor function and use it to walk the AST
    function transformer(sourceFile: SourceFile): SourceFile {
      // This visitor function can either return a node, in which case the subtree rooted at the returned node is
      // substituted for the subtree rooted at the visited node, or can use the recursive `visitEachChild` function
      // provided by TS to continue traversing the tree.
      function visitor(node: Node): VisitResult<Node> {
        // If we've found a `const` declaration, return a `var` declaration in its place
        if (isVariableDeclarationList(node) && isVarConst(node)) {
          // A declaration list with a `None` flag defaults to using `var`
          return createVariableDeclarationList(node.declarations, NodeFlags.None);
        }

        // This wasn't a node we're interested in, so keep walking down the tree.
        return visitEachChild(node, visitor, context);
      }

      // Having defined our visitor, pass it to the TS-provided `visitNode` function, which will use it to walk the AST,
      // and return the results of that walk.
      return visitNode(sourceFile, visitor);
    }

    // Back in the transformer factory, return the transformer we just created
    return transformer;
  }

  // Finally, we're back in `factory`, and can return the whole nested system
  return transformerFactory;
}
