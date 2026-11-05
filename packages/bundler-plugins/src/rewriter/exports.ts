import type {
  BaseNode,
  ClassDeclarationNode,
  ExportDefaultNode,
  ExportNamedNode,
  ExportSpecifierNode,
  IdentifierNode,
  ImportDeclarationNode,
  ProgramBody,
  VariableDeclarationNode,
} from './ast';
import {
  declarationOf,
  declaredNames,
  exportedName,
  isAnonymousFunctionOrClass,
  isCallToMethod,
  isTypeOnlyExport,
} from './ast';
import type { RewriteState } from './rewriter';

/** Builds the expression that wraps `target`, e.g. `target => \`wrap(${target})\``. */
export type WrapExpression = (target: string) => string;

/**
 * Handles one export specifier of a statement passed to {@link wrapSpecifierExports}.
 * Returns the `Wrapped as Exported` pair to emit in its place, or `undefined`
 * to keep the specifier as written. Statements the pair depends on go onto
 * `prelude`, which is emitted before the rebuilt export.
 */
export type SpecifierWrapper = (
  specifier: ExportSpecifierNode,
  sourceLiteral: string | undefined,
  prelude: string[],
) => string | undefined;

/** Specifier name a `export { default as X } from '...'` re-export uses for the source's default. */
const DEFAULT_IMPORT = 'default';

/** Top-level class declarations, exported or not, by name. */
export function collectTopLevelClasses(ast: ProgramBody): Map<string, ClassDeclarationNode> {
  const classes = new Map<string, ClassDeclarationNode>();
  for (const node of ast.body) {
    const declaration = declarationOf(node);
    if (declaration?.type !== 'ClassDeclaration') continue;
    const classNode = declaration as ClassDeclarationNode;
    if (classNode.id?.name) classes.set(classNode.id.name, classNode);
  }
  return classes;
}

/** Top-level binding name → the statement that declares it. */
export function collectDeclaringStatements(ast: ProgramBody): Map<string, BaseNode> {
  const statements = new Map<string, BaseNode>();
  for (const node of ast.body) {
    const declaration = declarationOf(node);
    if (!declaration) continue;
    const ids =
      declaration.type === 'VariableDeclaration'
        ? ((declaration as VariableDeclarationNode).declarations ?? []).map(declarator => declarator.id)
        : declaration.type === 'ImportDeclaration'
          ? ((declaration as ImportDeclarationNode).specifiers ?? []).map(specifier => specifier.local)
          : [(declaration as ClassDeclarationNode).id];
    for (const id of ids) {
      const name = id?.type === 'Identifier' ? (id as { name?: string }).name : undefined;
      if (name) statements.set(name, node);
    }
  }
  return statements;
}

/**
 * Top-level bindings already assigned the result of one of `wrapperNames`
 * (`const X = wrap(...)`), so exporting one must not wrap it a second time.
 */
export function collectManuallyWrappedLocals(ast: ProgramBody, wrapperNames: readonly string[]): Set<string> {
  const locals = new Set<string>();

  for (const node of ast.body) {
    const declaration = declarationOf(node);
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const declarator of (declaration as VariableDeclarationNode).declarations ?? []) {
      const name = declarator.id?.type === 'Identifier' ? (declarator.id as IdentifierNode).name : undefined;
      const init = declarator.init;
      if (name && init && wrapperNames.some(wrapper => isCallToMethod(init, wrapper))) {
        locals.add(name);
      }
    }
  }

  return locals;
}

/** The value export statements (`export const`, `export { }`) that export `name`. */
export function findNamedExports(ast: ProgramBody, name: string): ExportNamedNode[] {
  const found: ExportNamedNode[] = [];
  for (const node of ast.body) {
    if (node.type !== 'ExportNamedDeclaration' || isTypeOnlyExport(node as ExportNamedNode)) continue;
    const exportNode = node as ExportNamedNode;
    const exportsName = exportNode.declaration
      ? !!declaredNames(exportNode.declaration)?.includes(name)
      : (exportNode.specifiers ?? []).some(
          specifier => !isTypeOnlyExport(specifier) && exportedName(specifier.exported) === name,
        );
    if (exportsName) found.push(exportNode);
  }
  return found;
}

/**
 * Wrap a binding declared in this module and return the binding that holds the wrapper.
 *
 * The declaration is left exactly as written, so a class or function keeps its
 * `Function.prototype.name`. Only the *export* has to become the wrapper, so the wrapper gets its
 * own binding and the export is aliased to it.
 */
export function wrapLocalBinding(
  state: RewriteState,
  localName: string,
  declaringNode: BaseNode,
  wrap: WrapExpression,
): string {
  const existing = state.wrappedLocals.get(localName);
  if (existing) return existing;

  const wrappedName = `__SENTRY_WRAPPED_${localName}__`;
  state.wrappedLocals.set(localName, wrappedName);
  state.ms.appendLeft(declaringNode.end, `\nconst ${wrappedName} = ${wrap(localName)};\n`);
  state.needsImport = true;
  return wrappedName;
}

/**
 * Wrap `localName` where an inline export declares it (`export class X {}`,
 * `export const x = ...`, `export function x() {}`). The `export` keyword is
 * stripped and the export is aliased to the wrapper. Other names the same
 * declaration exports are exported again unchanged.
 *
 * @returns whether the declaration exports `localName`
 */
export function wrapInlineExport(
  state: RewriteState,
  exportNode: ExportNamedNode,
  localName: string,
  wrap: WrapExpression,
): boolean {
  const declaration = exportNode.declaration;
  const names = declaration ? declaredNames(declaration) : undefined;
  if (!declaration || !names?.includes(localName)) return false;

  state.ms.overwrite(exportNode.start, declaration.start, '');

  const wrappedName = wrapLocalBinding(state, localName, declaration, wrap);
  const specifiers = names.map(name => (name === localName ? `${wrappedName} as ${name}` : name));
  state.ms.appendLeft(exportNode.end, `export { ${specifiers.join(', ')} };\n`);
  return true;
}

/**
 * Wrap the specifiers of an `export { ... }` statement that `wrapSpecifier` picks.
 *
 * Each such specifier is re-pointed at a binding holding the wrapper, which means rebuilding the
 * statement; the other specifiers are carried over verbatim. A binding that lives in **another**
 * module is first bound under a private name (see {@link wrapForeignExport}), since an import
 * binding cannot be reassigned and the `from` form has no local binding at all.
 */
export function wrapSpecifierExports(
  state: RewriteState,
  node: ExportNamedNode,
  wrapSpecifier: SpecifierWrapper,
): void {
  const specifiers = node.specifiers ?? [];
  if (specifiers.length === 0 || isTypeOnlyExport(node)) return;

  const sourceLiteral = node.source ? state.ms.original.slice(node.source.start, node.source.end) : undefined;

  const prelude: string[] = [];
  const wrappedPairs: string[] = [];
  const kept: string[] = [];

  for (const specifier of specifiers) {
    const pair = isTypeOnlyExport(specifier) ? undefined : wrapSpecifier(specifier, sourceLiteral, prelude);
    if (pair) {
      wrappedPairs.push(pair);
    } else {
      kept.push(state.ms.original.slice(specifier.start, specifier.end));
    }
  }

  if (wrappedPairs.length === 0) return;

  const statements = [...prelude, `export { ${wrappedPairs.join(', ')} };`];
  if (kept.length > 0) {
    const clause = `export { ${kept.join(', ')} }`;
    statements.push(sourceLiteral ? `${clause} from ${sourceLiteral};` : `${clause};`);
  }
  state.ms.overwrite(node.start, node.end, statements.join('\n'));
}

/**
 * Wrap a binding that comes from another module: imported and re-exported
 * (`sourceLiteral` undefined), or re-exported directly (`export { x } from`).
 * Pushes the statements that bind the wrapper onto `prelude` and returns the
 * pair to export.
 */
export function wrapForeignExport(
  state: RewriteState,
  localName: string,
  exportedAs: string,
  sourceLiteral: string | undefined,
  prelude: string[],
  wrap: WrapExpression,
): string {
  let target = localName;

  if (sourceLiteral) {
    target = `__SENTRY_REEXPORT_${exportedAs}__`;
    prelude.push(importAs(localName, target, sourceLiteral));
  }

  const wrappedName = `__SENTRY_WRAPPED_${exportedAs}__`;
  prelude.push(`const ${wrappedName} = ${wrap(target)};`);
  state.needsImport = true;
  return `${wrappedName} as ${exportedAs}`;
}

/**
 * Wrap `export default <declaration or expression>`.
 *
 * `export default Foo`, where `Foo` already has a wrapper binding (a class
 * also exported by name), is re-pointed at that binding instead of wrapping
 * twice.
 */
export function wrapDefaultExport(state: RewriteState, node: ExportDefaultNode, wrap: WrapExpression): void {
  const decl = node.declaration;

  if (decl.type === 'Identifier') {
    const wrappedName = state.wrappedLocals.get((decl as IdentifierNode).name);
    if (wrappedName) {
      state.ms.overwrite(decl.start, decl.end, wrappedName);
      return;
    }
  }

  // Only the `export default` keywords are replaced, so parentheses around the expression stay.
  const source = state.ms.original;
  const keywordsEnd = exportDefaultKeywordsEnd(source, node.start);
  const declaredName =
    decl.type === 'ClassDeclaration' || decl.type === 'FunctionDeclaration'
      ? (decl as ClassDeclarationNode).id?.name
      : undefined;

  // As with `export { handler as default }`, the export is set in two steps: bound as-is where the
  // original statement set it, then rebound at the end of the module to the wrapper, which sees
  // methods added in between. See `wrapDefaultSpecifier`.
  let wrapped = '__SENTRY_DEFAULT_EXPORT__';
  if (declaredName) {
    // `export default class Handler {}`: the declaration stays, so `Handler` stays bound in the module.
    state.ms.remove(node.start, decl.start);
    state.ms.appendLeft(node.end, `\nvar __SENTRY_DEFAULT_EXPORT__ = ${declaredName};`);
    wrapped = declaredName;
  } else if (isAnonymousFunctionOrClass(decl)) {
    // As a property value, the class or function gets the name `default`, as `export default` gives it.
    const hasSemicolon = source[node.end - 1] === ';';
    state.ms.overwrite(node.start, keywordsEnd, 'var __SENTRY_DEFAULT_EXPORT__ = { default:');
    state.ms.appendLeft(hasSemicolon ? node.end - 1 : node.end, hasSemicolon ? ' }.default' : ' }.default;');
  } else {
    state.ms.overwrite(node.start, keywordsEnd, 'var __SENTRY_DEFAULT_EXPORT__ =');
  }
  state.ms.appendLeft(node.end, '\nexport { __SENTRY_DEFAULT_EXPORT__ as default };');
  state.ms.append(`\n__SENTRY_DEFAULT_EXPORT__ = ${wrap(wrapped)};`);
  state.needsImport = true;
}

/**
 * Offset just past the `default` keyword of the `export default` statement at `start`. Comments can
 * sit between `export`, `default` and the expression, and may themselves contain the word `default`.
 */
function exportDefaultKeywordsEnd(source: string, start: number): number {
  let index = start + 'export'.length;
  while (index < source.length && !source.startsWith('default', index)) {
    if (source.startsWith('//', index)) {
      const lineEnd = source.indexOf('\n', index);
      index = lineEnd === -1 ? source.length : lineEnd;
    } else if (source.startsWith('/*', index)) {
      const commentEnd = source.indexOf('*/', index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
    } else {
      index++;
    }
  }
  return index + 'default'.length;
}

/**
 * `export { handler as default }`, the form bundlers emit for a default export. The export is set
 * in two steps. Right after `handler` is declared, it is bound to `handler` as-is, so a circular
 * import that reads it during module evaluation gets the handler, as before the transform. At the
 * end of the module, it is rebound to the wrapper, so a handler assigned or given methods later is
 * wrapped as it ends up. The binding is a `var`: a read before `handler` is declared gets
 * `undefined`, as it would from the bundler's own `var`, where a `const` would throw and stop the
 * Worker from starting.
 *
 * @returns the pair to export in place of the specifier
 */
export function wrapDefaultSpecifier(
  state: RewriteState,
  localName: string,
  declaringStatement: BaseNode | undefined,
  wrap: WrapExpression,
): string {
  // Same as `export default Foo`: re-point at the wrapper a named export already made.
  const wrappedName = state.wrappedLocals.get(localName);
  if (wrappedName) return `${wrappedName} as default`;

  if (declaringStatement) {
    state.ms.appendLeft(declaringStatement.end, `\nvar __SENTRY_DEFAULT_EXPORT__ = ${localName};`);
  }
  state.ms.append(`\n${declaringStatement ? '' : 'var '}__SENTRY_DEFAULT_EXPORT__ = ${wrap(localName)};`);
  state.needsImport = true;
  return '__SENTRY_DEFAULT_EXPORT__ as default';
}

/**
 * `export { default } from './handler'` and `export { x as default } from './handler'`.
 *
 * The original re-export is a live binding to the handler module's export, but the wrapper is not
 * set until this module's body runs. A circular import that reads the default export before then
 * gets `undefined` instead of the handler. The binding is a `var` so that the read does not throw,
 * as a `const` would, and stop the Worker from starting. See `wrapDefaultSpecifier`.
 *
 * @returns the pair to export in place of the specifier
 */
export function wrapDefaultReexport(
  state: RewriteState,
  localName: string,
  sourceLiteral: string,
  prelude: string[],
  wrap: WrapExpression,
): string {
  const target = '__SENTRY_REEXPORT_default__';
  prelude.push(importAs(localName, target, sourceLiteral), `var __SENTRY_DEFAULT_EXPORT__ = ${wrap(target)};`);
  state.needsImport = true;
  return '__SENTRY_DEFAULT_EXPORT__ as default';
}

function importAs(importedName: string, localName: string, sourceLiteral: string): string {
  return importedName === DEFAULT_IMPORT
    ? `import ${localName} from ${sourceLiteral};`
    : `import { ${importedName} as ${localName} } from ${sourceLiteral};`;
}
