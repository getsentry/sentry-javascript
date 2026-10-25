/* eslint-disable max-lines */
import MagicString from 'magic-string';
import { DEFAULT_EXPORT, type ExportName, type SameWorkerBinding } from './bindings';
import { detectWorkerEntrypointClasses } from './workerEntrypoint';

const MERGED_OPTIONS_IDENTIFIER = '__SENTRY_OPTIONS__';

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

interface ExportSpecifierNode extends BaseNode {
  local?: { type: string; name?: string };
  exported?: { type: string; name?: string };
}

interface ExportNamedNode extends BaseNode {
  declaration?: BaseNode | null;
  source?: BaseNode | null;
  specifiers?: ExportSpecifierNode[];
}

interface VariableDeclaratorNode {
  id?: { type: string; name?: string };
  init?: BaseNode | null;
}

interface VariableDeclarationNode extends BaseNode {
  declarations?: VariableDeclaratorNode[];
}

interface ImportDeclarationNode extends BaseNode {
  specifiers?: Array<{ local?: { type: string; name?: string } }>;
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

/**
 * The kind of Sentry wrapper to apply to an exported class.
 *
 * `durableObject` and `workflow` are keyed by name from the wrangler config
 * (`durable_objects.bindings`, `workflows`), since those class names are
 * authoritative there. `workerEntrypoint` is different: a worker's own
 * entrypoints aren't enumerated in its config, so they're detected structurally
 * (a class extending `WorkerEntrypoint` from `cloudflare:workers`), with the
 * config providing only a fallback for self-bound entrypoints whose base class
 * lives in another module.
 */
export type ClassWrapperKind = 'durableObject' | 'agent' | 'workflow' | 'workerEntrypoint';

/** Specifier name a `export { default as X } from '...'` re-export uses for the source's default. */
const DEFAULT_IMPORT = 'default';

/**
 * The `@sentry/cloudflare` helper each wrapper kind emits. All share the same
 * `(optionsCallback, Class)` signature. `WorkerEntrypoint` classes use
 * `withSentry`, which runtime-detects the class type and routes accordingly.
 */
const WRAPPER_METHODS: Record<ClassWrapperKind, string> = {
  durableObject: 'instrumentDurableObjectWithSentry',
  agent: 'instrumentAgentWithSentry',
  workflow: 'instrumentWorkflowWithSentry',
  workerEntrypoint: 'withSentry',
};

export interface TransformContext {
  /**
   * Exported class name → the kind of Sentry wrapper to apply. Populated from
   * the wrangler config, so the transform can wrap by name without resolving
   * each class's base type.
   */
  classWrappers: Map<string, ClassWrapperKind>;
  /**
   * Local class names detected as `agents` Agents. An Agent is configured as a Durable Object in
   * wrangler, so this upgrades those entries from `durableObject` to `agent`.
   */
  agentClasses?: ReadonlySet<string>;
  optionsFn: string;
  /** Import statement prepended when `optionsFn` references a separate module. */
  optionsImport?: string;
  /** @see {@link import('./wranglerConfig').WranglerConfig.sameWorkerBindings} */
  sameWorkerBindings?: readonly SameWorkerBinding[];
}

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  /**
   * The configured class names that were actually wrapped. Lets the plugin warn
   * about configured classes it could not find, instead of silently leaving
   * them uninstrumented.
   */
  wrappedClasses: Set<string>;
}

/**
 * Rewrite the worker entry source to wrap its default export with `withSentry`
 * and any configured class export with its matching Sentry wrapper (see
 * {@link TransformContext.classWrappers}, e.g. Durable Object classes with
 * `instrumentDurableObjectWithSentry`).
 *
 * Handles `export class MyDO {}`, the specifier form (`class MyDO {}` …
 * `export { MyDO }` / `export { Foo as MyDO }`), and classes that live in
 * another module (`import { MyDO } from './do'; export { MyDO }` or
 * `export { MyDO } from './do'`). Only star re-exports (`export * from './do'`)
 * are left alone — the plugin warns about those via
 * {@link TransformResult.wrappedClasses}.
 *
 * Exported (rather than inlined into the plugin) so it can be unit-tested with a
 * plain AST and no Vite context. Returns `undefined` when nothing was wrapped and
 * there are no already-manually-wrapped classes to report.
 */
export function applyAutoInstrumentTransforms(
  code: string,
  ast: ProgramBody,
  ctx: TransformContext,
): TransformResult | undefined {
  const ms = new MagicString(code);
  const topLevelClasses = collectTopLevelClasses(ast);
  const sameWorkerBindings = ctx.sameWorkerBindings ?? [];
  const state: TransformState = {
    ms,
    needsImport: false,
    wrappedClasses: new Set<string>(),
    topLevelClasses,
    renamedLocals: new Set<string>(),
    exportedClasses: collectExportedClasses(ast),
    aliasedLocals: new Map<string, string>(),
    classWrappers: ctx.classWrappers,
    agentClasses: ctx.agentClasses ?? new Set<string>(),
    workerEntrypointClasses: detectWorkerEntrypointClasses(ast),
    // The identifier must be chosen before wrapping, which bindings survive is only known after.
    optionsFn: sameWorkerBindings.length > 0 ? MERGED_OPTIONS_IDENTIFIER : ctx.optionsFn,
    autoWrapped: new Set<ExportName>(),
    manuallyWrappedLocals: collectManuallyWrappedLocals(ast),
    declaringStatements: collectDeclaringStatements(ast),
  };
  const { wrappedClasses } = state;

  // Named exports first, regardless of source order: the default-export handler
  // needs to know which local bindings a named export already wrapped, so it can
  // skip a class that is both exported by name and re-exported as default (which
  // would otherwise wrap it twice). Declaration exports (`export class Foo`) go before
  // specifier exports (`export { Foo as MyDO }`) for the same reason.
  const namedExports = ast.body.filter(node => node.type === 'ExportNamedDeclaration') as ExportNamedNode[];
  for (const node of namedExports) {
    if (node.declaration) handleNamedExport(node, ctx, state);
  }
  for (const node of namedExports) {
    if (!node.declaration) handleNamedExport(node, ctx, state);
  }
  for (const node of ast.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      wrapDefaultExport(node as ExportDefaultNode, ctx, state);
    }
  }

  if (!state.needsImport) {
    // Nothing was rewritten. Still surface any classes found already wrapped
    // manually (via `wrappedClasses`) so the caller doesn't warn about them;
    // return undefined only when there was nothing to report either.
    if (wrappedClasses.size === 0) return undefined;
    return { code, map: ms.generateMap({ hires: true }), wrappedClasses };
  }

  // `prepend` inserts before earlier prepends, yielding: Sentry import, options import, declaration.
  if (sameWorkerBindings.length > 0) {
    ms.prepend(buildMergedOptionsDeclaration(sameWorkerBindings, ctx.optionsFn, state));
  }
  if (ctx.optionsImport) ms.prepend(ctx.optionsImport);
  ms.prepend("import * as __SENTRY__ from '@sentry/cloudflare';\n");

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true }),
    wrappedClasses,
  };
}

interface TransformState {
  ms: MagicString;
  needsImport: boolean;
  wrappedClasses: Set<string>;
  /**
   * Top-level class declarations, exported or not, so specifier exports like
   * `export { MyDO }` can locate the class they refer to.
   */
  topLevelClasses: Map<string, ClassDeclarationNode>;
  /**
   * Local class names already renamed + wrapped, so two specifiers pointing at
   * the same class don't produce duplicate bindings.
   */
  renamedLocals: Set<string>;
  /** Names of top-level classes declared with `export class`. */
  exportedClasses: Set<string>;
  /**
   * `export class` name → the binding holding its wrapper, for a class exported by its own name
   * unwrapped and wrapped only under another name by a specifier (`export { Foo as MyDO }`).
   */
  aliasedLocals: Map<string, string>;
  /** Class name → wrapper kind, keyed by the *exported* name (from config). */
  classWrappers: Map<string, ClassWrapperKind>;
  /** Local class names detected as `agents` Agents (see {@link TransformContext.agentClasses}). */
  agentClasses: ReadonlySet<string>;
  /**
   * Local class names detected as `WorkerEntrypoint` subclasses in this module,
   * so they can be wrapped without a config entry.
   */
  workerEntrypointClasses: Set<string>;
  optionsFn: string;
  /**
   * Export names wrapped by this transform, so their options can be extended with
   * `rpcTracePropagationBindings`. Hand-wrapped exports stay out, they keep the options they were
   * wrapped with. `wrappedClasses` counts both.
   */
  autoWrapped: Set<ExportName>;
  /**
   * Top-level bindings already assigned an `instrument*WithSentry(...)` result
   * (`const MyDO = instrumentDurableObjectWithSentry(...)`). Exporting one by
   * specifier must report it as wrapped rather than wrap it a second time.
   */
  manuallyWrappedLocals: Set<string>;
  /** Top-level binding name → the statement that declares it. */
  declaringStatements: Map<string, BaseNode>;
}

/**
 * Builds the callback that merges same-worker binding names into `rpcTracePropagationBindings` at
 * runtime, the options object only exists once the callback runs with `env`. Only bindings whose
 * class this transform wrapped survive, a hand-wrapped class runs on its own options.
 *
 * The same callback also turns `enableRpcTracePropagation` on, because it is what the wrapped
 * receivers read to continue an incoming trace. An explicit value in the user's options wins.
 */
function buildMergedOptionsDeclaration(
  sameWorkerBindings: readonly SameWorkerBinding[],
  optionsFn: string,
  state: TransformState,
): string {
  const bindingNames = sameWorkerBindings
    .filter(({ className }) => state.autoWrapped.has(className))
    .map(({ bindingName }) => bindingName);

  if (!bindingNames.length) {
    return `const ${MERGED_OPTIONS_IDENTIFIER} = ${optionsFn};\n`;
  }

  const names = bindingNames.map(name => JSON.stringify(name)).join(', ');
  return (
    `const ${MERGED_OPTIONS_IDENTIFIER} = (env) => { ` +
    `const opts = (${optionsFn})(env); ` +
    'return { ...opts, ' +
    'enableRpcTracePropagation: opts?.enableRpcTracePropagation ?? true, ' +
    `rpcTracePropagationBindings: [${names}, ...(opts?.rpcTracePropagationBindings ?? [])] }; };\n`
  );
}

/**
 * Resolve the wrapper kind for a class export.
 *
 * Config (`classWrappers`) wins — it's authoritative for Durable Objects and
 * Workflows, and provides the self-binding fallback for WorkerEntrypoints whose
 * base class this module can't see. Otherwise a structurally-detected
 * `WorkerEntrypoint` subclass (matched by its *local* name) gets wrapped with
 * `withSentry`.
 *
 * `localName` is the binding **in this module** the export refers to, and must be
 * left undefined for `export { X } from '...'`: there the specifier's name belongs
 * to the source module, so matching it against anything detected here would wrap a
 * class that merely shares a name.
 *
 * The one case where config is refined rather than obeyed is an `agents` Agent:
 * it *is* a Durable Object, so wrangler can only ever describe it as one, and
 * only the detected base chain distinguishes the two.
 */
function resolveWrapperKind(
  exportedName: string,
  localName: string | undefined,
  state: TransformState,
): ClassWrapperKind | undefined {
  const configured = state.classWrappers.get(exportedName);

  if (
    configured === 'durableObject' &&
    ((localName && state.agentClasses.has(localName)) || state.agentClasses.has(exportedName))
  ) {
    return 'agent';
  }

  if (configured) return configured;
  if (localName && state.workerEntrypointClasses.has(localName)) return 'workerEntrypoint';
  return undefined;
}

/**
 * Top-level `const X = instrument*WithSentry(...)` bindings — a hand-wrapped class that is exported
 * separately (`export { X }`) rather than inline.
 */
function collectManuallyWrappedLocals(ast: ProgramBody): Set<string> {
  const wrapperMethods = Object.values(WRAPPER_METHODS);
  const locals = new Set<string>();

  for (const node of ast.body) {
    const declaration = declarationOf(node);
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const declarator of (declaration as VariableDeclarationNode).declarations ?? []) {
      const name = declarator.id?.type === 'Identifier' ? declarator.id.name : undefined;
      const init = declarator.init;
      if (name && init && wrapperMethods.some(method => isCallToMethod(init, method))) {
        locals.add(name);
      }
    }
  }

  return locals;
}

function collectDeclaringStatements(ast: ProgramBody): Map<string, BaseNode> {
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
      if (id?.type === 'Identifier' && id.name) statements.set(id.name, node);
    }
  }
  return statements;
}

function collectTopLevelClasses(ast: ProgramBody): Map<string, ClassDeclarationNode> {
  const classes = new Map<string, ClassDeclarationNode>();
  for (const node of ast.body) {
    const declaration = declarationOf(node);
    if (declaration?.type !== 'ClassDeclaration') continue;
    const classNode = declaration as ClassDeclarationNode;
    if (classNode.id?.name) classes.set(classNode.id.name, classNode);
  }
  return classes;
}

function collectExportedClasses(ast: ProgramBody): Set<string> {
  const names = new Set<string>();
  for (const node of ast.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = (node as ExportNamedNode).declaration;
    if (declaration?.type !== 'ClassDeclaration') continue;
    const name = (declaration as ClassDeclarationNode).id?.name;
    if (name) names.add(name);
  }
  return names;
}

/** The declaration a top-level statement makes, looking through `export` (`export const x = ...`). */
function declarationOf(node: BaseNode): BaseNode | null | undefined {
  return node.type === 'ExportNamedDeclaration' ? (node as ExportNamedNode).declaration : node;
}

function wrapDefaultExport(node: ExportDefaultNode, ctx: TransformContext, state: TransformState): void {
  const decl = node.declaration;

  // Already wrapped — leave it alone
  if (isCallToMethod(decl, 'withSentry')) return;

  // `export default Foo` where `Foo` is a local class already wrapped by a named
  // export (e.g. a self-bound WorkerEntrypoint also used as the default handler).
  // Wrapping again would produce `withSentry(withSentry(...))`. The binding still
  // points at the wrapped class, so the default export counts as auto-wrapped.
  if (decl.type === 'Identifier' && state.renamedLocals.has((decl as IdentifierNode).name)) {
    state.autoWrapped.add(DEFAULT_EXPORT);
    return;
  }

  // MagicString positions are always relative to the original source. Only the `export default`
  // keywords are replaced, so parentheses around the expression stay.
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
  state.ms.append(`\n__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry(${state.optionsFn}, ${wrapped});`);
  state.needsImport = true;
  state.autoWrapped.add(DEFAULT_EXPORT);
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

function isAnonymousFunctionOrClass(node: BaseNode): boolean {
  if (node.type === 'ArrowFunctionExpression') return true;
  const isFunctionOrClass = [
    'FunctionExpression',
    'FunctionDeclaration',
    'ClassExpression',
    'ClassDeclaration',
  ].includes(node.type);
  return isFunctionOrClass && !(node as ClassDeclarationNode).id;
}

function handleNamedExport(node: ExportNamedNode, ctx: TransformContext, state: TransformState): void {
  const decl = node.declaration;

  // ---- Manually wrapped class export ----
  // `export const MyDO = instrumentDurableObjectWithSentry(...)` — count it
  // as wrapped so the plugin doesn't warn about it, but leave it alone.
  if (decl?.type === 'VariableDeclaration') {
    collectManuallyWrappedClassExports(decl as VariableDeclarationNode, ctx, state);
    return;
  }

  // ---- Named class export matching a configured binding ----
  if (decl?.type === 'ClassDeclaration') {
    wrapInlineClassExport(node, decl as ClassDeclarationNode, ctx, state);
    return;
  }

  // ---- Specifier export (`export { Foo as MyDO }`, `export { MyDO } from './do'`) ----
  wrapSpecifierExports(node, ctx, state);
}

function collectManuallyWrappedClassExports(
  varDecl: VariableDeclarationNode,
  ctx: TransformContext,
  state: TransformState,
): void {
  for (const declarator of varDecl.declarations ?? []) {
    const name = declarator.id?.type === 'Identifier' ? declarator.id.name : undefined;
    const kind = name ? ctx.classWrappers.get(name) : undefined;
    if (!name || !kind || !declarator.init) continue;

    // A hand-wrapped Agent is configured as a Durable Object, so accept either helper there —
    // otherwise an already-instrumented Agent would be reported as unwrapped.
    const accepted =
      kind === 'durableObject' ? [WRAPPER_METHODS.durableObject, WRAPPER_METHODS.agent] : [WRAPPER_METHODS[kind]];

    if (accepted.some(method => isCallToMethod(declarator.init as BaseNode, method))) {
      state.wrappedClasses.add(name);
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
  // Inline export: the exported name and the local class name are the same.
  const kind = classId ? resolveWrapperKind(classId.name, classId.name, state) : undefined;
  if (!classId || !kind) return;

  const className = classId.name;
  const renamedClass = `__SENTRY_ORIGINAL_${className}__`;

  // Strip the `export ` keyword
  state.ms.overwrite(exportNode.start, classDecl.start, '');

  // Rename the class to avoid a duplicate binding
  state.ms.overwrite(classId.start, classId.end, renamedClass);

  // Insert the wrapped re-export after the class body
  state.ms.appendLeft(
    exportNode.end,
    `\nexport const ${className} = __SENTRY__.${WRAPPER_METHODS[kind]}(${state.optionsFn}, ${renamedClass});\n`,
  );

  state.wrappedClasses.add(className);
  state.autoWrapped.add(className);
  state.renamedLocals.add(className);
  state.needsImport = true;
}

/**
 * Wrap the configured classes an `export { ... }` statement names.
 *
 * A class *declared* in this module keeps the statement intact: the declaration is renamed and the
 * wrapper takes over its binding, so the untouched specifier now exports the wrapped class.
 *
 * A class that lives in **another** module — imported and re-exported, or re-exported directly — has
 * no local binding to overwrite (import bindings are immutable). Those specifiers are re-pointed at
 * a fresh wrapper binding instead, which means rebuilding the statement; specifiers this plugin has
 * no business touching are carried over verbatim.
 */
function wrapSpecifierExports(node: ExportNamedNode, ctx: TransformContext, state: TransformState): void {
  const specifiers = node.specifiers ?? [];
  if (specifiers.length === 0) return;

  const sourceLiteral = node.source ? state.ms.original.slice(node.source.start, node.source.end) : undefined;

  const prelude: string[] = [];
  const wrappedPairs: string[] = [];
  const kept: string[] = [];

  for (const specifier of specifiers) {
    const pair = wrapCrossModuleSpecifier(specifier, sourceLiteral, ctx, state, prelude);
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
 * `export { handler as default }`, the form bundlers emit for a default export. The export is set
 * in two steps. Right after `handler` is declared, it is bound to `handler` as-is, so a circular
 * import that reads it during module evaluation gets the handler, as before the transform. At the
 * end of the module, it is rebound to the wrapper, so a handler assigned or given methods later is
 * wrapped as it ends up. The binding is a `var`: a read before `handler` is declared gets
 * `undefined`, as it would from the bundler's own `var`, where a `const` would throw and stop the
 * Worker from starting.
 */
function wrapDefaultSpecifier(localName: string, state: TransformState): string | undefined {
  if (state.manuallyWrappedLocals.has(localName)) return undefined;

  // Same as `export default Foo`: a local class already wrapped by a named export keeps its
  // binding, which now points at the wrapped class, so the specifier can stay as written.
  if (state.renamedLocals.has(localName)) {
    state.autoWrapped.add(DEFAULT_EXPORT);
    return undefined;
  }

  const declaringStatement = state.declaringStatements.get(localName);
  if (declaringStatement) {
    state.ms.appendLeft(declaringStatement.end, `\nvar __SENTRY_DEFAULT_EXPORT__ = ${localName};`);
  }
  state.ms.append(
    `\n${declaringStatement ? '' : 'var '}__SENTRY_DEFAULT_EXPORT__ = __SENTRY__.withSentry(${state.optionsFn}, ${localName});`,
  );
  state.needsImport = true;
  state.autoWrapped.add(DEFAULT_EXPORT);
  return '__SENTRY_DEFAULT_EXPORT__ as default';
}

/**
 * `export { default } from './handler'`. The handler may already be wrapped in its own module,
 * which this transform cannot see, so the emitted guard returns such a handler as-is.
 *
 * The original re-export is a live binding to the handler module's export, but the wrapper is not
 * set until this module's body runs. A circular import that reads the default export before then
 * gets `undefined` instead of the handler. The binding is a `var` so that the read does not throw,
 * as a `const` would, and stop the Worker from starting. See `wrapDefaultSpecifier`.
 */
function wrapDefaultReexport(
  localName: string,
  sourceLiteral: string,
  state: TransformState,
  prelude: string[],
): string {
  const target = '__SENTRY_REEXPORT_default__';
  prelude.push(
    localName === DEFAULT_IMPORT
      ? `import ${target} from ${sourceLiteral};`
      : `import { ${localName} as ${target} } from ${sourceLiteral};`,
    `var __SENTRY_DEFAULT_EXPORT__ = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.withSentry, ${state.optionsFn}, ${target});`,
  );
  state.needsImport = true;
  state.autoWrapped.add(DEFAULT_EXPORT);
  return '__SENTRY_DEFAULT_EXPORT__ as default';
}

/**
 * Handle one export specifier, returning the `Wrapped as Exported` pair to emit when its class has
 * to be wrapped through a fresh binding — the cross-module case. The import/wrapper statements that
 * pair depends on are pushed onto `prelude`.
 *
 * Returns `undefined` when the specifier can stay exactly as written: it doesn't name a configured
 * class, its class is declared locally (wrapped in place via {@link wrapLocalClassExport}, which
 * takes over the binding the specifier already exports), or the binding is already hand-wrapped.
 */
function wrapCrossModuleSpecifier(
  specifier: ExportSpecifierNode,
  sourceLiteral: string | undefined,
  ctx: TransformContext,
  state: TransformState,
  prelude: string[],
): string | undefined {
  const exportedName =
    specifier.type === 'ExportSpecifier' && specifier.exported?.type === 'Identifier'
      ? specifier.exported.name
      : undefined;
  const localName = specifier.local?.type === 'Identifier' ? specifier.local.name : undefined;
  // With a `from` clause the specifier names an export of the *source* module, not a binding here.
  const kind = exportedName
    ? resolveWrapperKind(exportedName, sourceLiteral ? undefined : localName, state)
    : undefined;

  if (!exportedName || !localName) return undefined;
  if (!kind) {
    if (exportedName !== DEFAULT_IMPORT) return undefined;
    return sourceLiteral
      ? wrapDefaultReexport(localName, sourceLiteral, state, prelude)
      : wrapDefaultSpecifier(localName, state);
  }

  // Without a `from` clause the specifier points at a module-local binding, which may already be
  // (or become) the wrapped class without touching the export statement itself.
  if (!sourceLiteral) {
    const localClass = state.topLevelClasses.get(localName);

    // `export class Foo` that its own export left unwrapped: keep `Foo` exported as declared and
    // export a wrapper bound right after the class under the specifier's name.
    if (localClass?.id && state.exportedClasses.has(localName) && !state.renamedLocals.has(localName)) {
      const wrappedName = wrapExportedClassAlias(localName, localClass, kind, state);
      state.wrappedClasses.add(exportedName);
      state.autoWrapped.add(toExportName(exportedName));
      return `${wrappedName} as ${exportedName}`;
    }

    if (localClass?.id) {
      wrapLocalClassExport(localName, localClass, kind, ctx, state);
      state.wrappedClasses.add(exportedName);
      state.autoWrapped.add(toExportName(exportedName));
      state.needsImport = true;
      return undefined;
    }

    if (state.manuallyWrappedLocals.has(localName)) {
      state.wrappedClasses.add(exportedName);
      return undefined;
    }
  }

  // The class comes from another module: bind it under a private name (for the `from` form, which
  // has no local binding at all), wrap that, and export the wrapper under the configured name.
  let target = localName;

  if (sourceLiteral) {
    target = `__SENTRY_REEXPORT_${exportedName}__`;
    prelude.push(
      localName === DEFAULT_IMPORT
        ? `import ${target} from ${sourceLiteral};`
        : `import { ${localName} as ${target} } from ${sourceLiteral};`,
    );
  }

  const wrappedName = `__SENTRY_WRAPPED_${exportedName}__`;

  // The class may already be hand-wrapped in its own module, which this transform cannot see. The
  // emitted guard returns such a class as-is instead of nesting a second wrapper around it.
  prelude.push(
    `const ${wrappedName} = __SENTRY__._INTERNAL_wrapUnlessInstrumented(__SENTRY__.${WRAPPER_METHODS[kind]}, ${state.optionsFn}, ${target});`,
  );
  state.wrappedClasses.add(exportedName);
  state.autoWrapped.add(toExportName(exportedName));
  state.needsImport = true;

  return `${wrappedName} as ${exportedName}`;
}

/**
 * Bind a wrapper for an `export class` right after its declaration and return that binding. The
 * declaration and its own export stay as written.
 */
function wrapExportedClassAlias(
  localName: string,
  localClass: ClassDeclarationNode,
  kind: ClassWrapperKind,
  state: TransformState,
): string {
  const existing = state.aliasedLocals.get(localName);
  if (existing) return existing;

  const wrappedName = `__SENTRY_WRAPPED_${localName}__`;
  state.aliasedLocals.set(localName, wrappedName);
  state.ms.appendLeft(
    localClass.end,
    `\nconst ${wrappedName} = __SENTRY__.${WRAPPER_METHODS[kind]}(${state.optionsFn}, ${localName});\n`,
  );
  state.needsImport = true;
  return wrappedName;
}

/** The name same-worker bindings know an export by: `default` is the default export. */
function toExportName(exportedName: string): ExportName {
  return exportedName === DEFAULT_IMPORT ? DEFAULT_EXPORT : exportedName;
}

/** Rename a locally declared class and rebind its original name to the wrapper. */
function wrapLocalClassExport(
  localName: string,
  localClass: ClassDeclarationNode,
  kind: ClassWrapperKind,
  ctx: TransformContext,
  state: TransformState,
): void {
  const classId = localClass.id;
  if (!classId || state.renamedLocals.has(localName)) return;
  state.renamedLocals.add(localName);

  const renamedClass = `__SENTRY_ORIGINAL_${localName}__`;
  state.ms.overwrite(classId.start, classId.end, renamedClass);
  state.ms.appendLeft(
    localClass.end,
    `\nconst ${localName} = __SENTRY__.${WRAPPER_METHODS[kind]}(${state.optionsFn}, ${renamedClass});\n`,
  );
}
