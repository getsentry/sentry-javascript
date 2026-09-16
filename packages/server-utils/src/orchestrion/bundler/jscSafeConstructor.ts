import { parse } from 'meriyah';
import type { CustomTransform } from '../apmTypes';

/* oxlint-disable typescript/no-explicit-any -- estree nodes are walked and rewritten structurally */
/* oxlint-disable typescript/no-unsafe-member-access -- estree nodes are walked and rewritten structurally */
type AnyNode = any;

/**
 * Depth-first walk over every AST node reachable from `root`, calling `visit` on
 * each. Follows own-enumerable properties only, skipping the `type` string.
 */
function walk(root: AnyNode, visit: (node: AnyNode) => void): void {
  if (!root || typeof root !== 'object') {
    return;
  }
  if (Array.isArray(root)) {
    for (const child of root) {
      walk(child, visit);
    }
    return;
  }
  if (typeof root.type === 'string') {
    visit(root);
  }
  for (const key of Object.keys(root)) {
    if (key !== 'type') {
      walk((root as Record<string, unknown>)[key], visit);
    }
  }
}

/** Whether `fnBody` contains a `super(...)` call, i.e. it is a derived constructor's body. */
function hasSuperCall(fnBody: AnyNode): boolean {
  let found = false;
  walk(fnBody, node => {
    // `super(...)` — the callee is a bare `Super` node. `super.method(...)` (a
    // `MemberExpression` callee) is a method call, not a constructor call, and is left out.
    if (node.type === 'CallExpression' && node.callee?.type === 'Super') {
      found = true;
    }
  });
  return found;
}

/** Parse a snippet (which may contain `return`) into its list of statements. */
function statementsOf(code: string): AnyNode[] {
  return (parse(`function __apm$f(){${code}}`, { next: true }).body[0] as AnyNode).body.body;
}

/**
 * A `traceSync` override that makes orchestrion's constructor instrumentation safe on JavaScriptCore
 * (Bun's engine), for derived-class constructors only. Everything else is left byte-identical.
 *
 * Orchestrion wraps a sync function's body in nested closures and, in the outer `runStores`
 * callback's `finally`, records the instance with `__apm$ctx.self ??= this`. For a DERIVED
 * constructor, `super()` ends up buried inside those closures (`__apm$traced` → `__apm$wrapped`),
 * while the `finally` is a sibling scope that does not lexically enclose it. V8 (Node/Deno/workerd)
 * accepts the `this` access there via a runtime this-binding check; JSC rejects it statically:
 *
 *   ReferenceError: 'super()' must be called in derived constructor before accessing |this|
 *
 * ...which crashes `new Hono()` at boot. The fix is to capture `this` in a scope that DOES enclose
 * `super()`: this override runs the built-in `traceSync`, then moves the `self` capture out of the
 * `finally` into `__apm$traced`, right after `__apm$wrapped(...)` returns. The behaviour is
 * unchanged (`self` is still recorded before `end` publishes); only the capture's lexical position
 * moves. Because JSC is the only engine that needs this, the override is wired in the Bun bundler
 * plugin alone (see `bun.ts`); every other target keeps the default output.
 *
 * The rewrite is keyed on orchestrion's own generated identifiers (`__apm$traced` / `__apm$wrapped`
 * / `__apm$ctx.self`). If a future transformer version changes that shape, the rewrite no-ops and
 * warns rather than silently reintroducing the crash — the Bun boot test would then fail loudly.
 */
export const jscSafeConstructorTransform: CustomTransform = (state, node, parent, ancestry) => {
  // Detect the derived constructor BEFORE the default runs: it moves the body (with `super()`) into
  // `__apm$wrapped`. Only a constructor `FunctionExpression` with a `super()` call is affected.
  const isDerivedConstructor = (node as AnyNode).type === 'FunctionExpression' && hasSuperCall((node as AnyNode).body);

  const defaults = (state as AnyNode).transforms.defaults;
  defaults.traceSync(state, node, parent, ancestry);

  if (!isDerivedConstructor) {
    return;
  }

  const body: AnyNode[] = (node as AnyNode).body.body;

  // `const __apm$traced = () => { const __apm$wrapped = …; return __apm$wrapped(...__apm$arguments); }`
  const traced = body.find(
    stmt =>
      stmt.type === 'VariableDeclaration' &&
      stmt.declarations[0]?.id?.name === '__apm$traced' &&
      stmt.declarations[0].init?.type === 'ArrowFunctionExpression',
  )?.declarations[0].init;

  const tracedBody: AnyNode[] | undefined = traced?.body?.body;
  const returnIndex =
    tracedBody?.findIndex(
      stmt =>
        stmt.type === 'ReturnStatement' &&
        stmt.argument?.type === 'CallExpression' &&
        stmt.argument.callee?.name === '__apm$wrapped',
    ) ?? -1;

  if (!tracedBody || returnIndex === -1) {
    warnShapeChanged('`__apm$traced` wrapper');
    return;
  }

  // Replace `return __apm$wrapped(...)` with `const __apm$r = __apm$wrapped(...); __apm$ctx.self ??= this; return __apm$r;`.
  // `this` here sits inside `__apm$traced`, which lexically encloses the `super()` call — JSC-safe.
  const replacement = statementsOf('const __apm$r = 0; __apm$ctx.self ??= this; return __apm$r;');
  replacement[0].declarations[0].init = tracedBody[returnIndex].argument;
  tracedBody.splice(returnIndex, 1, ...replacement);

  // Drop the now-relocated `__apm$ctx.self ??= this;` from the `finally` (it must not access `this`).
  let removed = false;
  walk((node as AnyNode).body, current => {
    if (current.type === 'TryStatement' && current.finalizer) {
      const before = current.finalizer.body.length;
      current.finalizer.body = current.finalizer.body.filter(
        (stmt: AnyNode) =>
          !(
            stmt.type === 'ExpressionStatement' &&
            stmt.expression?.type === 'AssignmentExpression' &&
            stmt.expression.operator === '??=' &&
            stmt.expression.left?.type === 'MemberExpression' &&
            stmt.expression.left.object?.name === '__apm$ctx' &&
            stmt.expression.left.property?.name === 'self'
          ),
      );
      if (current.finalizer.body.length !== before) {
        removed = true;
      }
    }
  });

  if (!removed) {
    warnShapeChanged('`finally` self-capture');
  }
};

function warnShapeChanged(what: string): void {
  // oxlint-disable-next-line no-console -- runs in the user's build, where the Sentry debug logger is off
  console.warn(
    `[Sentry] Could not apply the JSC-safe constructor rewrite (${what} not found). Hono (and other ` +
      'derived-class instrumentation) may crash on Bun. Please report this with your @sentry/bun version.',
  );
}
