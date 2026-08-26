import MagicString from 'magic-string';
import type { SameWorkerBinding } from './wranglerConfig';
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
 * Handles both `export class MyDO {}` and the specifier form
 * (`class MyDO {}` … `export { MyDO }` / `export { Foo as MyDO }`).
 * Re-exports from other modules (`export { MyDO } from './do'`) cannot be
 * wrapped here and are left alone — the plugin warns about them via
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
    classWrappers: ctx.classWrappers,
    agentClasses: ctx.agentClasses ?? new Set<string>(),
    workerEntrypointClasses: detectWorkerEntrypointClasses(ast),
    // The identifier must be chosen before wrapping, which bindings survive is only known after.
    optionsFn: sameWorkerBindings.length > 0 ? MERGED_OPTIONS_IDENTIFIER : ctx.optionsFn,
    autoWrapped: new Set<string | undefined>(),
  };
  const { wrappedClasses } = state;

  // Named exports first, regardless of source order: the default-export handler
  // needs to know which local bindings a named export already wrapped, so it can
  // skip a class that is both exported by name and re-exported as default (which
  // would otherwise wrap it twice).
  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      handleNamedExport(node, ctx, state);
    }
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
   * Top-level (non-exported) class declarations, so specifier exports like
   * `export { MyDO }` can locate the class they refer to.
   */
  topLevelClasses: Map<string, ClassDeclarationNode>;
  /**
   * Local class names already renamed + wrapped, so two specifiers pointing at
   * the same class don't produce duplicate bindings.
   */
  renamedLocals: Set<string>;
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
   * Exported names this transform wrapped itself, unlike `wrappedClasses` which also counts
   * hand-wrapped classes. `undefined` marks the default export, mirroring
   * {@link SameWorkerBinding.className}.
   */
  autoWrapped: Set<string | undefined>;
}

/**
 * Builds the callback that merges same-worker binding names into `rpcTracePropagationBindings` at
 * runtime, the options object only exists once the callback runs with `env`. Only bindings whose
 * class this transform wrapped survive, a hand-wrapped class runs on its own options.
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
    `return { ...opts, rpcTracePropagationBindings: [${names}, ...(opts?.rpcTracePropagationBindings ?? [])] }; };\n`
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
  if (configured === 'durableObject' && localName && state.agentClasses.has(localName)) return 'agent';
  if (configured) return configured;
  if (localName && state.workerEntrypointClasses.has(localName)) return 'workerEntrypoint';
  return undefined;
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

  // `export default Foo` where `Foo` is a local class already wrapped by a named
  // export (e.g. a self-bound WorkerEntrypoint also used as the default handler).
  // Wrapping again would produce `withSentry(withSentry(...))`. The binding still
  // points at the wrapped class, so the default export counts as auto-wrapped.
  if (decl.type === 'Identifier' && state.renamedLocals.has((decl as IdentifierNode).name)) {
    state.autoWrapped.add(undefined);
    return;
  }

  // `export default <expr>` → `const __SENTRY_DEFAULT_EXPORT__ = <expr>`
  // MagicString positions are always relative to the original source.
  state.ms.overwrite(node.start, decl.start, 'const __SENTRY_DEFAULT_EXPORT__ = ');
  state.ms.append(`\nexport default __SENTRY__.withSentry(${state.optionsFn}, __SENTRY_DEFAULT_EXPORT__);\n`);
  state.needsImport = true;
  state.autoWrapped.add(undefined);
}

function handleNamedExport(node: ExportNamedNode, ctx: TransformContext, state: TransformState): void {
  const decl = node.declaration;

  // ---- Manually wrapped class export ----
  // `export const MyDO = instrumentDurableObjectWithSentry(...)` — count it
  // as wrapped so the plugin doesn't warn about it, but leave it alone.
  if (decl?.type === 'VariableDeclaration') {
    collectManuallyWrappedClassExports(decl, ctx, state);
    return;
  }

  // ---- Named class export matching a configured binding ----
  if (decl?.type === 'ClassDeclaration') {
    wrapInlineClassExport(node, decl, ctx, state);
    return;
  }

  // ---- Specifier export of a local class (`export { Foo as MyDO }`) ----
  // Re-exports from another module carry a `source` — nothing local to wrap.
  if (node.source) return;
  for (const specifier of node.specifiers ?? []) {
    wrapSpecifierExport(specifier, ctx, state);
  }
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

function wrapSpecifierExport(specifier: ExportSpecifierNode, ctx: TransformContext, state: TransformState): void {
  if (specifier.type !== 'ExportSpecifier' || specifier.exported?.type !== 'Identifier') return;
  const exportedName = specifier.exported.name;
  if (!exportedName) return;

  const localName = specifier.local?.type === 'Identifier' ? specifier.local.name : undefined;
  const kind = resolveWrapperKind(exportedName, localName, state);
  if (!kind) return;

  const localClass = localName ? state.topLevelClasses.get(localName) : undefined;
  if (!localName || !localClass?.id) return;

  state.wrappedClasses.add(exportedName);
  state.autoWrapped.add(exportedName);
  state.needsImport = true;
  if (state.renamedLocals.has(localName)) return;
  state.renamedLocals.add(localName);

  const renamedClass = `__SENTRY_ORIGINAL_${localName}__`;
  state.ms.overwrite(localClass.id.start, localClass.id.end, renamedClass);
  // The existing `export { ... }` statement keeps exporting the (now
  // wrapped) `localName` binding, so the wrapper is NOT exported here.
  state.ms.appendLeft(
    localClass.end,
    `\nconst ${localName} = __SENTRY__.${WRAPPER_METHODS[kind]}(${state.optionsFn}, ${renamedClass});\n`,
  );
}
