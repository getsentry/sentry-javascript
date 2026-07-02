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
 * plain AST and no Vite context. Returns `undefined` when nothing was wrapped.
 */
export function applyAutoInstrumentTransforms(
  code: string,
  ast: ProgramBody,
  ctx: TransformContext,
): TransformResult | undefined {
  const ms = new MagicString(code);
  let needsImport = false;
  const wrappedDoClasses = new Set<string>();

  // Top-level (non-exported) class declarations, so specifier exports like
  // `export { MyDO }` can locate the class they refer to.
  const topLevelClasses = new Map<string, ClassDeclarationNode>();
  for (const node of ast.body) {
    if (node.type !== 'ClassDeclaration') continue;
    const classNode = node as ClassDeclarationNode;
    if (classNode.id?.name) topLevelClasses.set(classNode.id.name, classNode);
  }
  // Local class names already renamed + wrapped, so two specifiers pointing at
  // the same class don't produce duplicate bindings.
  const renamedLocals = new Set<string>();

  for (const node of ast.body) {
    // ---- Default export ----
    if (node.type === 'ExportDefaultDeclaration') {
      const decl = (node as ExportDefaultNode).declaration;

      // Already wrapped — leave it alone
      if (isCallToMethod(decl, 'withSentry')) continue;

      // `export default <expr>` → `const __SENTRY_DEFAULT_EXPORT__ = <expr>`
      // MagicString positions are always relative to the original source.
      ms.overwrite(node.start, decl.start, 'const __SENTRY_DEFAULT_EXPORT__ = ');
      ms.append(`\nexport default __SENTRY__.withSentry(${ctx.optionsFn}, __SENTRY_DEFAULT_EXPORT__);\n`);
      needsImport = true;
    }

    if (node.type !== 'ExportNamedDeclaration') continue;
    const exportNode = node as ExportNamedNode;

    // ---- Named class export matching a DO binding ----
    const classDecl = exportNode.declaration;
    if (classDecl?.type === 'ClassDeclaration') {
      const classId = (classDecl as ClassDeclarationNode).id;
      if (!classId || !ctx.doClassNames.has(classId.name)) continue;

      const className = classId.name;
      const renamedClass = `__SENTRY_ORIGINAL_${className}__`;

      // Strip the `export ` keyword
      ms.overwrite(node.start, classDecl.start, '');

      // Rename the class to avoid a duplicate binding
      ms.overwrite(classId.start, classId.end, renamedClass);

      // Insert the wrapped re-export after the class body
      ms.appendLeft(
        node.end,
        `\nexport const ${className} = __SENTRY__.instrumentDurableObjectWithSentry(${ctx.optionsFn}, ${renamedClass});\n`,
      );

      wrappedDoClasses.add(className);
      renamedLocals.add(className);
      needsImport = true;
      continue;
    }

    // ---- Specifier export of a local class (`export { Foo as MyDO }`) ----
    // Re-exports from another module carry a `source` — nothing local to wrap.
    if (exportNode.source) continue;
    for (const specifier of exportNode.specifiers ?? []) {
      if (specifier.type !== 'ExportSpecifier' || specifier.exported?.type !== 'Identifier') continue;
      const exportedName = specifier.exported.name;
      if (!exportedName || !ctx.doClassNames.has(exportedName)) continue;

      const localName = specifier.local?.type === 'Identifier' ? specifier.local.name : undefined;
      const localClass = localName ? topLevelClasses.get(localName) : undefined;
      if (!localName || !localClass?.id) continue;

      wrappedDoClasses.add(exportedName);
      needsImport = true;
      if (renamedLocals.has(localName)) continue;
      renamedLocals.add(localName);

      const renamedClass = `__SENTRY_ORIGINAL_${localName}__`;
      ms.overwrite(localClass.id.start, localClass.id.end, renamedClass);
      // The existing `export { ... }` statement keeps exporting the (now
      // wrapped) `localName` binding, so the wrapper is NOT exported here.
      ms.appendLeft(
        localClass.end,
        `\nconst ${localName} = __SENTRY__.instrumentDurableObjectWithSentry(${ctx.optionsFn}, ${renamedClass});\n`,
      );
    }
  }

  if (!needsImport) return undefined;

  if (ctx.optionsImport) ms.prepend(ctx.optionsImport);
  ms.prepend("import * as __SENTRY__ from '@sentry/cloudflare';\n");

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true }),
    wrappedDoClasses,
  };
}
