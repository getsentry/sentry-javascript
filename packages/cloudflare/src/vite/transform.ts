import MagicString from 'magic-string';

// ---------------------------------------------------------------------------
// Minimal ESTree node types for the AST nodes we inspect.
// ---------------------------------------------------------------------------

export interface BaseNode {
  type: string;
  start: number;
  end: number;
}

export interface ProgramBody {
  body: BaseNode[];
}

interface IdentifierNode extends BaseNode {
  name: string;
}

interface CalleeNode {
  type: string;
  name?: string;
  property?: { type: string; name?: string };
}

interface CallExpressionNode extends BaseNode {
  callee?: CalleeNode;
}

interface ClassDeclarationNode extends BaseNode {
  id?: IdentifierNode | null;
}

interface ExportDefaultNode extends BaseNode {
  declaration: BaseNode;
}

interface ExportSpecifierNode {
  type: string;
  local?: { type: string; name?: string };
  exported?: { type: string; name?: string };
}

interface ExportNamedNode extends BaseNode {
  declaration?: BaseNode | null;
  source?: unknown;
  specifiers?: ExportSpecifierNode[];
}

interface VariableDeclaratorNode {
  id?: { type: string; name?: string };
  init?: BaseNode | null;
}

interface VariableDeclarationNode extends BaseNode {
  declarations?: VariableDeclaratorNode[];
}

function isCallToMethod(node: BaseNode, methodName: string): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = (node as CallExpressionNode).callee;
  if (!callee) return false;
  if (callee.type === 'Identifier' && callee.name === methodName) return true;
  return (
    callee.type === 'MemberExpression' && callee.property?.type === 'Identifier' && callee.property.name === methodName
  );
}

export interface TransformContext {
  doClassNames: Set<string>;
  optionsFn: string;
  /** Import statement prepended when `optionsFn` references a separate module. */
  optionsImport?: string;
  /**
   * Statements prepended to the entry even when nothing else was wrapped
   * (e.g. the orchestrion bundler marker, which must run in dev where the
   * build-time `renderChunk` banner never fires).
   */
  prependBanner?: string;
}

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  /**
   * The Durable Object class names (as configured in wrangler) that were
   * actually wrapped. Lets the plugin warn about configured classes it could
   * not find, instead of silently leaving them uninstrumented.
   */
  wrappedDoClasses: Set<string>;
}

/**
 * Rewrite the worker entry source to wrap its default export with `withSentry`
 * and any exported Durable Object class with `instrumentDurableObjectWithSentry`.
 *
 * Handles both `export class MyDO {}` and the specifier form
 * (`class MyDO {}` … `export { MyDO }` / `export { Foo as MyDO }`).
 * Re-exports from other modules (`export { MyDO } from './do'`) cannot be
 * wrapped here and are left alone — the plugin warns about them via
 * {@link TransformResult.wrappedDoClasses}.
 *
 * Exported (rather than inlined into the plugin) so it can be unit-tested with a
 * plain AST and no Vite context. Returns `undefined` when nothing was wrapped
 * and no `prependBanner` was requested.
 */
export function applyAutoInstrumentTransforms(
  code: string,
  ast: ProgramBody,
  ctx: TransformContext,
): TransformResult | undefined {
  const ms = new MagicString(code);
  const state: TransformState = {
    ms,
    needsImport: false,
    wrappedDoClasses: new Set<string>(),
    topLevelClasses: collectTopLevelClasses(ast),
    renamedLocals: new Set<string>(),
  };
  const { wrappedDoClasses } = state;

  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      wrapDefaultExport(node as ExportDefaultNode, ctx, state);
    } else if (node.type === 'ExportNamedDeclaration') {
      handleNamedExport(node as ExportNamedNode, ctx, state);
    }
  }

  if (!state.needsImport) {
    if (!ctx.prependBanner) return undefined;
    // Nothing to wrap (e.g. the user wrapped manually) but the banner must
    // still reach the entry. Prepend via magic-string to keep the map aligned.
    const bannerOnly = new MagicString(code);
    bannerOnly.prepend(ctx.prependBanner);
    return {
      code: bannerOnly.toString(),
      map: bannerOnly.generateMap({ hires: true }),
      wrappedDoClasses,
    };
  }

  if (ctx.optionsImport) ms.prepend(ctx.optionsImport);
  ms.prepend("import * as __SENTRY__ from '@sentry/cloudflare';\n");
  if (ctx.prependBanner) ms.prepend(ctx.prependBanner);

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true }),
    wrappedDoClasses,
  };
}

interface TransformState {
  ms: MagicString;
  needsImport: boolean;
  wrappedDoClasses: Set<string>;
  /**
   * Top-level (non-exported) class declarations, so specifier exports like
   * `export { MyDO }` can locate the class they refer to.
   */
  topLevelClasses: Map<string, ClassDeclarationNode>;
  /**
   * Local class names already renamed + wrapped, so two specifiers pointing at
   * the same class don't produce duplicate bindings.
   */
  renamedLocals: Set<string>;
}

function collectTopLevelClasses(ast: ProgramBody): Map<string, ClassDeclarationNode> {
  const classes = new Map<string, ClassDeclarationNode>();
  for (const node of ast.body) {
    if (node.type !== 'ClassDeclaration') continue;
    const classNode = node as ClassDeclarationNode;
    if (classNode.id?.name) classes.set(classNode.id.name, classNode);
  }
  return classes;
}

function wrapDefaultExport(node: ExportDefaultNode, ctx: TransformContext, state: TransformState): void {
  const decl = node.declaration;

  // Already wrapped — leave it alone
  if (isCallToMethod(decl, 'withSentry')) return;

  // `export default <expr>` → `const __SENTRY_DEFAULT_EXPORT__ = <expr>`
  // MagicString positions are always relative to the original source.
  state.ms.overwrite(node.start, decl.start, 'const __SENTRY_DEFAULT_EXPORT__ = ');
  state.ms.append(`\nexport default __SENTRY__.withSentry(${ctx.optionsFn}, __SENTRY_DEFAULT_EXPORT__);\n`);
  state.needsImport = true;
}

function handleNamedExport(node: ExportNamedNode, ctx: TransformContext, state: TransformState): void {
  const decl = node.declaration;

  // ---- Manually wrapped DO export ----
  // `export const MyDO = instrumentDurableObjectWithSentry(...)` — count it
  // as wrapped so the plugin doesn't warn about it, but leave it alone.
  if (decl?.type === 'VariableDeclaration') {
    collectManuallyWrappedDoExports(decl as VariableDeclarationNode, ctx, state);
    return;
  }

  // ---- Named class export matching a DO binding ----
  if (decl?.type === 'ClassDeclaration') {
    wrapInlineClassExport(node, decl as ClassDeclarationNode, ctx, state);
    return;
  }

  // ---- Specifier export of a local class (`export { Foo as MyDO }`) ----
  // Re-exports from another module carry a `source` — nothing local to wrap.
  if (node.source) return;
  for (const specifier of node.specifiers ?? []) {
    wrapSpecifierExport(specifier, ctx, state);
  }
}

function collectManuallyWrappedDoExports(
  varDecl: VariableDeclarationNode,
  ctx: TransformContext,
  state: TransformState,
): void {
  for (const declarator of varDecl.declarations ?? []) {
    if (
      declarator.id?.type === 'Identifier' &&
      declarator.id.name &&
      ctx.doClassNames.has(declarator.id.name) &&
      declarator.init &&
      isCallToMethod(declarator.init, 'instrumentDurableObjectWithSentry')
    ) {
      state.wrappedDoClasses.add(declarator.id.name);
    }
  }
}

function wrapInlineClassExport(
  exportNode: ExportNamedNode,
  classDecl: ClassDeclarationNode,
  ctx: TransformContext,
  state: TransformState,
): void {
  const classId = classDecl.id;
  if (!classId || !ctx.doClassNames.has(classId.name)) return;

  const className = classId.name;
  const renamedClass = `__SENTRY_ORIGINAL_${className}__`;

  // Strip the `export ` keyword
  state.ms.overwrite(exportNode.start, classDecl.start, '');

  // Rename the class to avoid a duplicate binding
  state.ms.overwrite(classId.start, classId.end, renamedClass);

  // Insert the wrapped re-export after the class body
  state.ms.appendLeft(
    exportNode.end,
    `\nexport const ${className} = __SENTRY__.instrumentDurableObjectWithSentry(${ctx.optionsFn}, ${renamedClass});\n`,
  );

  state.wrappedDoClasses.add(className);
  state.renamedLocals.add(className);
  state.needsImport = true;
}

function wrapSpecifierExport(specifier: ExportSpecifierNode, ctx: TransformContext, state: TransformState): void {
  if (specifier.type !== 'ExportSpecifier' || specifier.exported?.type !== 'Identifier') return;
  const exportedName = specifier.exported.name;
  if (!exportedName || !ctx.doClassNames.has(exportedName)) return;

  const localName = specifier.local?.type === 'Identifier' ? specifier.local.name : undefined;
  const localClass = localName ? state.topLevelClasses.get(localName) : undefined;
  if (!localName || !localClass?.id) return;

  state.wrappedDoClasses.add(exportedName);
  state.needsImport = true;
  if (state.renamedLocals.has(localName)) return;
  state.renamedLocals.add(localName);

  const renamedClass = `__SENTRY_ORIGINAL_${localName}__`;
  state.ms.overwrite(localClass.id.start, localClass.id.end, renamedClass);
  // The existing `export { ... }` statement keeps exporting the (now
  // wrapped) `localName` binding, so the wrapper is NOT exported here.
  state.ms.appendLeft(
    localClass.end,
    `\nconst ${localName} = __SENTRY__.instrumentDurableObjectWithSentry(${ctx.optionsFn}, ${renamedClass});\n`,
  );
}
