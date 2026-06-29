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

function isCallToMethod(node: BaseNode, methodName: string): boolean {
  if (node.type !== 'CallExpression') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callee = (node as any).callee;
  if (!callee) return false;
  if (callee.type === 'Identifier' && callee.name === methodName) return true;
  if (
    callee.type === 'MemberExpression' &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === methodName
  ) {
    return true;
  }
  return false;
}

export interface TransformContext {
  doClassNames: Set<string>;
  optionsFn: string;
  /** Import statement prepended when `optionsFn` references a separate module. */
  optionsImport?: string;
}

/**
 * Rewrite the worker entry source to wrap its default export with `withSentry`
 * and any exported Durable Object class with `instrumentDurableObjectWithSentry`.
 *
 * Exported (rather than inlined into the plugin) so it can be unit-tested with a
 * plain AST and no Vite context. Returns `undefined` when nothing was wrapped.
 */
export function applyAutoInstrumentTransforms(
  code: string,
  ast: ProgramBody,
  ctx: TransformContext,
): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined {
  const ms = new MagicString(code);
  let needsImport = false;

  for (const node of ast.body) {
    // ---- Default export ----
    if (node.type === 'ExportDefaultDeclaration') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decl: BaseNode = (node as any).declaration;

      // Already wrapped — leave it alone
      if (isCallToMethod(decl, 'withSentry')) continue;

      // `export default <expr>` → `const __SENTRY_DEFAULT_EXPORT__ = <expr>`
      // MagicString positions are always relative to the original source.
      ms.overwrite(node.start, decl.start, 'const __SENTRY_DEFAULT_EXPORT__ = ');
      ms.append(`\nexport default __SENTRY__.withSentry(${ctx.optionsFn}, __SENTRY_DEFAULT_EXPORT__);\n`);
      needsImport = true;
    }

    // ---- Named class export matching a DO binding ----
    if (node.type === 'ExportNamedDeclaration') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const classDecl: BaseNode | null = (node as any).declaration;
      if (!classDecl || classDecl.type !== 'ClassDeclaration') continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const classId: { name: string; start: number; end: number } | null = (classDecl as any).id;
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

      needsImport = true;
    }
  }

  if (!needsImport) return undefined;

  if (ctx.optionsImport) ms.prepend(ctx.optionsImport);
  ms.prepend("import * as __SENTRY__ from '@sentry/cloudflare';\n");

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true }),
  };
}
