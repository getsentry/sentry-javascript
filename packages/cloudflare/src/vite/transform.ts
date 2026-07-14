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

interface CalleeNode {
  type: string;
  name?: string;
  property?: { type: string; name?: string };
}

interface CallExpressionNode extends BaseNode {
  callee?: CalleeNode;
}

interface ExportDefaultNode extends BaseNode {
  declaration: BaseNode;
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
  optionsFn: string;
  /** Import statement prepended when `optionsFn` references a separate module. */
  optionsImport?: string;
}

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
}

/**
 * Rewrite the worker entry source to wrap its default export with `withSentry`.
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
  const state: TransformState = { ms, needsImport: false };

  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      wrapDefaultExport(node as ExportDefaultNode, ctx, state);
    }
  }

  if (!state.needsImport) return undefined;

  if (ctx.optionsImport) ms.prepend(ctx.optionsImport);
  ms.prepend("import * as __SENTRY__ from '@sentry/cloudflare';\n");

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true }),
  };
}

interface TransformState {
  ms: MagicString;
  needsImport: boolean;
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
