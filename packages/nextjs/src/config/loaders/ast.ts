/* eslint-disable max-lines */
import * as jscsTypes from 'jscodeshift';
import { default as jscodeshiftDefault } from 'jscodeshift';

import { makeParser } from './parsers';

// In `jscodeshift`, the exports look like this:
//
//     function core(...) { ... }
//     core.ABC = ...
//     core.XYZ = ...
//     module.exports = core
//
// In other words, when required/imported, the module is both a callable function and an object containing all sorts of
// properties. Meanwhile, its TS export is a namespace continaing the types of all of the properties attached to `core`.
// In order to use the types, we thus need to use `import *` syntax. But when we do that, Rollup only sees it as a
// namespace, and will complain if we try to use it as a function. In order to get around this, we take advantage of the
// fact that Rollup wraps imports in its own version of TS's `esModuleInterop` functions, aliasing the export to a
// `default` property inside the export. (So, here, we basically end up with `core.default = core`.) When referenced
// through that alias, `core` is correctly seen as callable by Rollup. Outside of a Rollup context, however, that
// `default` alias doesn't exist. So, we try both and use whichever one is defined. (See
// https://github.com/rollup/rollup/issues/1267.)
const jscodeshiftNamespace = jscsTypes;
const jscs = jscodeshiftDefault || jscodeshiftNamespace;

// These are types not in the TS sense, but in the instance-of-a-Type-class sense
const {
  ArrayPattern,
  ClassDeclaration,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportDefaultSpecifier,
  ExportNamedDeclaration,
  ExportSpecifier,
  FunctionDeclaration,
  Identifier,
  ImportSpecifier,
  JSXIdentifier,
  MemberExpression,
  Node,
  ObjectExpression,
  ObjectPattern,
  Property,
  RestElement,
  TSTypeParameter,
  VariableDeclaration,
  VariableDeclarator,
} = jscs;

type ASTNode = jscsTypes.ASTNode;
export type AST<T = ASTNode> = jscsTypes.Collection<T>;
// `parentPath` is on the prototype, but not included in the type for some reason. (`parent`, which is an instance
// property referencing the same object as `parentPath`, is in the type, and we could use that instead. But the
// `parentPath` name makes it clearer that said object is in fact a `NodePath`, not a `Node`, so we choose to use it
// over `parent`, even if it means adding it to the type.)
interface ASTPath<T = ASTNode> extends jscsTypes.ASTPath<T> {
  parentPath: ASTPath<ASTNode>;
}
type IdentifierNode = jscsTypes.Identifier;
type ExportSpecifierNode = jscsTypes.ExportSpecifier;
type VariableDeclarationNode = jscsTypes.VariableDeclaration;

/**
 * Create an AST based on the given code.
 *
 * @param code The code to convert to an AST.
 * @param isTS Flag indicating what parser to use.
 * @throws Parsing error if the code is unparsable
 * @returns The AST
 */
export function makeAST(code: string, isTS: boolean): AST {
  const parser = isTS ? makeParser('tsx') : makeParser('jsx');
  // If this errors, it will be caught in the calling function, where we know more information and can construct a
  // better warning message
  return jscs(code, { parser });
}

/**
 * Find all nodes which represent Identifiers with the given name
 *
 * @param ast The code, in AST form
 * @param name The Identifier name to search for
 * @returns A collection of NodePaths pointing to any nodes which were found
 */
function findIdentifiers(ast: AST, name: string): AST<IdentifierNode> {
  const identifierFilter = function (path: ASTPath<IdentifierNode>): boolean {
    // Check that what we have is indeed an Identifier, and that the name matches
    //
    // Note: If we were being super precise about this, we'd also check the context in which the identifier is being
    // used, because there are some cases where we actually don't want to be renaming things (if the identifier is being
    // used to name a class property, for example). But the chances that someone is going to have a class property in a
    // nextjs page file with the same name as one of the canonical functions are slim to none, so for simplicity we can
    // stop filtering here. If this ever becomes a problem, more precise filter checks can be found in a comment at the
    // bottom of this file.
    return path.node.name === name;
  };

  return ast.find(Identifier).filter(identifierFilter);
}

/**
 * Find all nodes which are declarations of variables with the given name
 *
 * @param ast The code, in AST form
 * @param name The variable name to search for
 * @returns A collection of NodePaths pointing to any nodes which were found
 */
export function findDeclarations(ast: AST, name: string): AST<VariableDeclarationNode> {
  // Check for a structure of the form
  //
  //     node: VariableDeclaration
  //      \
  //       declarations: VariableDeclarator[]
  //        \
  //         0 : VariableDeclarator
  //          \
  //           id: Identifier
  //            \
  //             name: string
  //
  // where `name` matches the given name.
  const declarationFilter = function (path: ASTPath<VariableDeclarationNode>): boolean {
    return (
      path.node.declarations.length === 1 &&
      VariableDeclarator.check(path.node.declarations[0]) &&
      Identifier.check(path.node.declarations[0].id) &&
      path.node.declarations[0].id.name === name
    );
  };

  return ast.find(VariableDeclaration).filter(declarationFilter);
}

/**
 * Find all nodes which are exports of variables with the given name
 *
 * @param ast The code, in AST form
 * @param name The variable name to search for
 * @returns A collection of NodePaths pointing to any nodes which were found
 */
export function findExports(ast: AST, name: string): AST<ExportSpecifierNode> {
  const exportFilter = function (path: ASTPath<ExportSpecifierNode>): boolean {
    return ExportSpecifier.check(path.node) && path.node.exported.name === name;
  };

  return ast.find(ExportSpecifier).filter(exportFilter);
}

/**
 * Rename all identifiers with the given name, except in cases where it would break outside references.
 *
 * @param ast The AST representing the code
 * @param origName The name being replaced
 * @param newName The new name to use, if already chosen (one will be generated if not given)
 * @returns The new name assigned to the identifiers, or undefined if no identifiers were renamed
 */
export function renameIdentifiers(ast: AST, origName: string, newName?: string): string | undefined {
  const matchingNodes = findIdentifiers(ast, origName);

  if (matchingNodes.length > 0) {
    // Find an available new name for the function by prefixing all references to it with an underscore (or a few
    // underscores, if that's what it takes to avoid a name collision).
    const alias = newName || findAvailibleAlias(ast, origName);
    matchingNodes.forEach(nodePath => {
      // Rename the node, except in cases where it might break an outside reference to it.
      maybeRenameNode(ast, nodePath, alias);
    });
    return alias;
  }

  // technically redundant, but needed to keep TS happy
  return undefined;
}

/**
 * Find an unused identifier name in the AST by repeatedly adding underscores to the beginning of the given original
 * name until we find one which hasn't already been taken.
 *
 * @param userAST The AST to search
 * @param origName The original name we want to alias
 * @returns
 */
function findAvailibleAlias(userAST: AST, origName: string): string {
  let foundAvailableName = false;
  let newName = origName;

  while (!foundAvailableName) {
    // Prefix the original function name (or the last name we tried) with an underscore and search for identifiers with
    // the new name in the AST
    newName = `_${newName}`;
    const existingIdentifiers = findIdentifiers(userAST, newName);

    // If we haven't found anything, we're good to go
    foundAvailableName = existingIdentifiers.length === 0;
  }

  return newName;
}

// When we're searching for and renaming the user's data-fetching functions, the general idea is to rename all
// identifiers matching the function names, but there are a few things to watch out for:
//   - We can't rename any identifiers that refer to something outside of the module, because then we'd break the link
//     between the external thing and the module's reference to it. The two key examples of this are named imports and
//     property access in objects instantiated outside of the module.
//   - What nextjs cares about is just the identifier which gets exported, which may or may not be what it's called
//     locally. In other words, if we find something like `export { something as getServerSideProps }`, we have to
//     rename both `something` and `getServerSideProps`, the former so we can wrap it and the latter so as not to
//     conflict with the wrapped function of the same name we're planning to export.
//   - Shorthand object notation is a thing. Specifically, it's a thing which makes two separate identifiers appear as
//     one, even though they have separate functions and may need to be treated differently from one another. This shows
//     up not just in object literals but also when destructuring and in imports and exports.

function maybeRenameNode(ast: AST, identifierPath: ASTPath<IdentifierNode>, alias: string): void {
  const node = identifierPath.node;
  const parent = identifierPath.parentPath.node;
  const grandparent = identifierPath.parentPath.parentPath.node;

  // In general we want to rename all nodes, unless we're in one of a few specific situations. (Anything which doesn't
  // get handled by one of these checks will be renamed at the end of this function.) In all of the scenarios below,
  // we'll use `gSSP` as our stand-in for any of `getServerSideProps`, `getStaticProps`, and `getStaticPaths`.

  // Imports:
  //
  //   - `import { gSSP } from 'yyy'`, which is equivalent (in AST terms) to `import { gSSP as gSSP } from 'yyy'`
  //   - `import { xxx as gSSP } from 'yyy'`
  //
  // The `xxx as gSSP` corresponds to an ImportSpecifier, with `imported = xxx` and `local = gSSP`. In both of these
  // cases, we want to rename `local` (the thing on the right; that will happen below) but not `imported` (the thing on
  // the left).
  if (ImportSpecifier.check(parent)) {
    if (node === parent.imported) return;
    // The only other option is that `node === parent.local`. This will get renamed below.
  }

  // Destructuring:
  //
  //   - `const { gSSP } = yyy`, which is equivalent (in AST terms) to `const { gSSP:gSSP } = yyy`
  //   - `const { xxx:gSSP } = yyy`
  //
  // This would come up if, for example, we were grabbing something from a namespace (`import * as yyy from 'zzz'; const
  // { xxx:gSSP } = yyy`). Here the `xxx:gSSP` corresponds to a Property (inside of an array inside of an ObjectPatten
  // inside of a VariableDeclarator), with `key = xxx` and `value = gSSP`. In both of these cases, we want to rename
  // `value` but not `key`. (Again here we're renaming the righthand thing but leaving the lefthand thing alone.)

  // And
  // though it's unlikely to be as relevant here, it's worth noting that we see the exact same pattern when
  // instantiating an object literal - `{ xxx }` or `{ xxx: yyy }` - where we rename the value but not the key. The only
  // difference there is that it's an `ObjectExpression` rather than an `ObjectPattern`.)
  if (Property.check(parent) && ObjectPattern.check(grandparent)) {
    if (node === parent.key) return;
    // The only other option is that `node === parent.value`. This will get renamed below. When it does, the names of
    // `parent.key` and `parent.value` won't match (if they ever did), so we need to make sure to update `shorthand`.
    parent.shorthand = false;
  }

  // Object literal instantiation:
  //
  //   - `const xxx = { gSSP }`, which is equivalent (in AST terms) to `const xxx = { gSSP: gSSP }`
  //   - `const xxx = { yyy: gSSP }`
  //
  // This is the same as destructuring in every way, with the exception that where there it was an `ObjectPattern`, here
  // it's an `ObjectExpression`.
  if (Property.check(parent) && ObjectExpression.check(grandparent)) {
    if (node === parent.key) return;
    // The only other option is that `node === parent.value`. This will get renamed below. When it does, the names of
    // `parent.key` and `parent.value` won't match (if they ever did), so we need to make sure to update `shorthand`.
    parent.shorthand = false;
  }

  // Object property access:
  //
  //   - xxx.yyy
  //
  // This is similar to destructuring (in that we we don't want to rename object keys), and would come up in similar
  // circumstances: `import * as xxx from 'abc'; const zzz = xxx.yyy`. In this case the `xxx.yyy` corresponds to a
  // `MemberExpression`, with `object = xxx` and `property = yyy`. (This is unlikely to be relevant in our case with
  // data-fetching functions, which is why none of the part of this example are `gSSP`. Nonetheless, good to be accurate
  // with these things.)
  if (MemberExpression.check(parent)) {
    if (node === parent.property) return;
    // The only other option is that `node === parent.object`. This will get renamed below.
  }

  // Exports:
  //
  //   - `export { gSSP }, which is equivalent (in AST terms) to `export { gSSP as gSSP }`
  //   - `export { xxx as gSSP }`
  //
  // Similar to the `import` cases, here the `xxx as gSSP` corresponds to an `ExportSpecifier`, with `local = xxx` and
  // `exported = gSSP`. And as before, we want to change `local`, but this time there's a twist. (Two of them,
  // actually.)
  //
  // First, if we care about this ExportSpecifier at all, it's because it's the export of one of our data-fetching
  // functions, as in the example above. Because we want to export a replacement version of said function, we need to
  // rename `exported`, to prevent a name conflict. (This is different than what you'd expect from a simple "rename a
  // variable" algorithm, because in that case you normally wouldn't rename the thing which could be referred to outside
  // of the module.)
  //
  // Second, because need to wrap the object using its local name, we need to rename `local`. This tracks with how we
  // thought about `import` statements above, but is different from everything else we're doing in this function in that
  // it means we potentially need to rename something *not* already named `getServerSideProps`, `getStaticProps`, or
  // `getStaticPaths`, meaning we need to rename nodes outside of the collection upon which we're currently acting.
  if (ExportSpecifier.check(parent)) {
    if (parent.exported.name !== parent.local?.name && node === parent.exported) {
      const currentLocalName = parent.local?.name || '';
      renameIdentifiers(ast, currentLocalName, alias);
    }

    // The only other options are that a) the names match, in which case both `local` and `exported` both have the name
    // of the function we're trying to wrap, and will get renamed below, or b) the names are different but `node` is
    // `local`, meaning this must be the second go-round of `renameIdentifiers`, where we're renaming everything with
    // the local name, not the name of our wrapped data-fetching function, in which case `node` (a.k.a. `local`) will
    // also get renamed below.
  }

  // handle any node which hasn't gotten otherwise dealt with above
  node.name = alias;
}

/**
 * Remove comments from all nodes in the given AST.
 *
 * Note: Comments are not nodes in and of themselves, but are instead attached to the nodes above and below them.
 *
 * @param ast The code, in AST form
 */
export function removeComments(ast: AST): void {
  const nodesWithComments = ast.find(Node).filter(nodePath => !!nodePath.node.comments);
  nodesWithComments.forEach(nodePath => (nodePath.node.comments = null));
}

/**
 * Determines from a given AST of a file whether the file has a default export or not.
 */
export function hasDefaultExport(ast: AST): boolean {
  const defaultExports = ast.find(Node, value => {
    return (
      ExportDefaultDeclaration.check(value) ||
      ExportDefaultSpecifier.check(value) ||
      (ExportSpecifier.check(value) && value.exported.name === 'default')
    );
  });

  // In theory there should only ever be 0 or 1, but who knows what people do
  return defaultExports.length > 0;
}

/**
 * Extracts all identifier names (`'constName'`) from an destructuringassignment'sArrayPattern (the `[constName]` in`const [constName] = [1]`).
 *
 * This function recursively calls itself and `getExportIdentifiersFromObjectPattern` since destructuring assignments
 * can be deeply nested with objects and arrays.
 *
 * Example - take the following program:
 *
 * ```js
 * export const [{ foo: name1 }, [{ bar: [name2]}, name3]] = [{ foo: 1 }, [{ bar: [2] }, 3]];
 * ```
 *
 * The `ArrayPattern` node in question for this program is the left hand side of the assignment:
 * `[{ foo: name1 }, [{ bar: [name2]}, name3]]`
 *
 * Applying this function to this `ArrayPattern` will return the following: `["name1", "name2", "name3"]`
 *
 * DISCLAIMER: This function only correcly extracts identifiers of `ArrayPatterns` in the context of export statements.
 * Using this for `ArrayPattern` outside of exports would require us to handle more edgecases. Hence the "Export" in
 * this function's name.
 */
function getExportIdentifiersFromArrayPattern(arrayPattern: jscsTypes.ArrayPattern): string[] {
  const identifiers: string[] = [];

  arrayPattern.elements.forEach(element => {
    if (Identifier.check(element)) {
      identifiers.push(element.name);
    } else if (ObjectPattern.check(element)) {
      identifiers.push(...getExportIdentifiersFromObjectPattern(element));
    } else if (ArrayPattern.check(element)) {
      identifiers.push(...getExportIdentifiersFromArrayPattern(element));
    } else if (RestElement.check(element) && Identifier.check(element.argument)) {
      // `RestElements` are spread operators
      identifiers.push(element.argument.name);
    }
  });

  return identifiers;
}

/**
 * Grabs all identifiers from an ObjectPattern within a destructured named export declaration
 * statement (`name` in "export const { val: name } = { val: 1 }").
 *
 * This function recursively calls itself and `getExportIdentifiersFromArrayPattern` since destructuring assignments
 * can be deeply nested with objects and arrays.
 *
 * Example - take the following program:
 *
 * ```js
 * export const { foo: [{ bar: name1 }], name2, ...name3 } = { foo: [{}] };
 * ```
 *
 * The `ObjectPattern` node in question for this program is the left hand side of the assignment:
 * `{ foo: [{ bar: name1 }], name2, ...name3 } = { foo: [{}] }`
 *
 * Applying this function to this `ObjectPattern` will return the following: `["name1", "name2", "name3"]`
 *
 * DISCLAIMER: This function only correcly extracts identifiers of `ObjectPatterns` in the context of export statements.
 * Using this for `ObjectPatterns` outside of exports would require us to handle more edgecases. Hence the "Export" in
 * this function's name.
 */
function getExportIdentifiersFromObjectPattern(objectPatternNode: jscsTypes.ObjectPattern): string[] {
  const identifiers: string[] = [];

  objectPatternNode.properties.forEach(property => {
    // An `ObjectPattern`'s properties can be either `Property`s or `RestElement`s.
    if (Property.check(property)) {
      if (Identifier.check(property.value)) {
        identifiers.push(property.value.name);
      } else if (ObjectPattern.check(property.value)) {
        identifiers.push(...getExportIdentifiersFromObjectPattern(property.value));
      } else if (ArrayPattern.check(property.value)) {
        identifiers.push(...getExportIdentifiersFromArrayPattern(property.value));
      } else if (RestElement.check(property.value) && Identifier.check(property.value.argument)) {
        // `RestElements` are spread operators
        identifiers.push(property.value.argument.name);
      }
      // @ts-ignore AST types are wrong here
    } else if (RestElement.check(property) && Identifier.check(property.argument)) {
      // `RestElements` are spread operators
      // @ts-ignore AST types are wrong here
      identifiers.push(property.argument.name as string);
    }
  });

  return identifiers;
}

/**
 * Given the AST of a file, this function extracts all named exports from the file.
 *
 * @returns a list of deduplicated identifiers.
 */
export function getExportIdentifierNames(ast: AST): string[] {
  // We'll use a set to dedupe at the end, but for now we use an array as our accumulator because you can add multiple elements to it at once.
  const identifiers: string[] = [];

  // The following variable collects all export statements that double as named declaration, e.g.:
  // - export function myFunc() {}
  // - export var myVar = 1337
  // - export const myConst = 1337
  // - export const { a, ..rest } = { a: 1, b: 2, c: 3 }
  // We will narrow those situations down in subsequent code blocks.
  const namedExportDeclarationNodeDeclarations = ast
    .find(ExportNamedDeclaration)
    .nodes()
    .map(namedExportDeclarationNode => namedExportDeclarationNode.declaration);

  namedExportDeclarationNodeDeclarations
    .filter((declarationNode): declarationNode is jscsTypes.VariableDeclaration =>
      // Narrow down to varible declarations, e.g.:
      // export const a = ...;
      // export var b = ...;
      // export let c = ...;
      // export let c, d = 1;
      VariableDeclaration.check(declarationNode),
    )
    .map(
      variableDeclarationNode =>
        // Grab all declarations in a single export statement.
        // There can be multiple in the case of for example in `export let a, b;`.
        variableDeclarationNode.declarations,
    )
    .reduce((prev, curr) => [...prev, ...curr], []) // flatten - now we have all declaration nodes in one flat array
    .forEach(declarationNode => {
      if (
        Identifier.check(declarationNode) || // should never happen
        JSXIdentifier.check(declarationNode) || // JSX like `<name></name>` - we don't care about these
        TSTypeParameter.check(declarationNode) // type definitions - we don't care about those
      ) {
        // We should never have to enter this branch, it is just for type narrowing.
      } else if (Identifier.check(declarationNode.id)) {
        // If it's a simple declaration with an identifier we collect it. (e.g. `const myIdentifier = 1;` -> "myIdentifier")
        identifiers.push(declarationNode.id.name);
      } else if (ObjectPattern.check(declarationNode.id)) {
        // If we encounter a destructuring export like `export const { foo: name1, bar: name2 } = { foo: 1, bar: 2 };`,
        // we try collecting the identifiers from the pattern `{ foo: name1, bar: name2 }`.
        identifiers.push(...getExportIdentifiersFromObjectPattern(declarationNode.id));
      } else if (ArrayPattern.check(declarationNode.id)) {
        // If we encounter a destructuring export like `export const [name1, name2] = [1, 2];`,
        // we try collecting the identifiers from the pattern `[name1, name2]`.
        identifiers.push(...getExportIdentifiersFromArrayPattern(declarationNode.id));
      }
    });

  namedExportDeclarationNodeDeclarations
    .filter(
      // Narrow down to class and function declarations, e.g.:
      // export class Foo {};
      // export function bar() {};
      (declarationNode): declarationNode is jscsTypes.ClassDeclaration | jscsTypes.FunctionDeclaration =>
        ClassDeclaration.check(declarationNode) || FunctionDeclaration.check(declarationNode),
    )
    .map(node => node.id) // Grab the identifier of the function/class - Note: it might be `null` when it's anonymous
    .filter((id): id is jscsTypes.Identifier => Identifier.check(id)) // Elaborate way of null-checking
    .forEach(id => identifiers.push(id.name)); // Collect the name of the identifier

  ast
    .find(ExportSpecifier) // Find stuff like `export {<id [as name]>} [from ...];`
    .nodes()
    .forEach(specifier => {
      // Taking the example above `specifier.exported.name` always contains `id` unless `name` is specified, then it's `name`;
      if (specifier.exported.name !== 'default') {
        // You can do default exports "export { something as default };" but we do not want to collect "default" in this
        // function since it only wants to collect named exports.
        identifiers.push(specifier.exported.name);
      }
    });

  ast
    .find(ExportAllDeclaration) // Find stuff like `export * from ..." and "export * as someVariable from ...`
    .nodes()
    .forEach(declaration => {
      // Narrow it down to only find `export * as someVariable from ...` (emphasis on "as someVariable")
      if (declaration.exported) {
        identifiers.push(declaration.exported.name); // `declaration.exported.name` contains "someVariable"
      }
    });

  return [...new Set(identifiers)]; // dedupe
}
