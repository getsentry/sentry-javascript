import {
  addImport,
  type BaseNode,
  type CallExpressionNode,
  collectDeclaringStatements,
  createCallSiteRewriter,
  createRewriteState,
  exportedName,
  isCallToMethod,
  parseModule,
  type ProgramBody,
  type PropertyNode,
  type RewriteRule,
  type RuleContext,
  walk,
  wrapArrayLiteral,
} from '@sentry/bundler-plugins/rewriter';
import type { Plugin } from 'vite';

type AutoInstrumentMiddlewareOptions = {
  enabled?: boolean;
  debug?: boolean;
};

type WrapResult = {
  code: string;
  didWrap: boolean;
  skipped: string[];
};

/** Calls `onSite` with each middleware value in the module and the label to report it under. */
type SiteFinder = (ast: ProgramBody, onSite: (label: string, value: BaseNode) => void) => void;

const SENTRY_MODULE = '@sentry/tanstackstart-react';
const WRAPPER = 'wrapMiddlewaresWithSentry';
// The id can end in a query, e.g. the server function module `foo.tsx?tss-serverfn-split`.
const SOURCE_FILE_REGEX = /\.(ts|tsx|js|jsx|mjs|mts)(\?|$)/;
const GLOBAL_MIDDLEWARE_KEYS = ['requestMiddleware', 'functionMiddleware'];

/** `requestMiddleware` and `functionMiddleware` properties inside a `createStart(...)` call. */
const findGlobalSites: SiteFinder = (ast, onSite) => {
  walk(ast, node => {
    if (!isCallToMethod(node, 'createStart')) return;
    walk((node as CallExpressionNode).arguments, inner => {
      const key = propertyKey(inner);
      const value = (inner as PropertyNode).value;
      if (key && value && GLOBAL_MIDDLEWARE_KEYS.includes(key)) onSite(key, value);
    });
  });
};

/** `middleware` properties, as route and handler options declare them. */
const findRouteSites: SiteFinder = (ast, onSite) => {
  walk(ast, node => {
    const value = (node as PropertyNode).value;
    if (value && propertyKey(node) === 'middleware') onSite('middleware', value);
  });
};

/** The argument of `.middleware(...)` calls, as `createServerFn()` chains make them. */
const findServerFnSites: SiteFinder = (ast, onSite) => {
  walk(ast, node => {
    const call = node as CallExpressionNode;
    const argument = call.arguments?.[0];
    if (
      argument &&
      call.callee?.type === 'MemberExpression' &&
      isCallToMethod(node, 'middleware') &&
      call.arguments?.length === 1
    ) {
      onSite('.middleware(', argument);
    }
  });
};

function propertyKey(node: BaseNode): string | undefined {
  if (node.type !== 'Property') return undefined;
  const property = node as PropertyNode;
  return property.computed || !property.value ? undefined : exportedName(property.key);
}

const TYPE_ONLY_WRAPPERS = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
]);

/** The expression inside wrappers such as `as const` and `satisfies`, which leave the value as it is. */
function unwrapTypeOnly(node: BaseNode): BaseNode {
  let current = node;
  while (TYPE_ONLY_WRAPPERS.has(current.type)) {
    const inner = (current as BaseNode & { expression?: BaseNode }).expression;
    if (!inner) break;
    current = inner;
  }
  return current;
}

/** Wraps each middleware array the finder reports, skipping values already wrapped. */
function wrapSites({ ast, id, state }: RuleContext, findSites: SiteFinder, debug: boolean): void {
  findSites(ast, (label, site) => {
    const value = unwrapTypeOnly(site);
    if (isCallToMethod(value, WRAPPER)) {
      state.report.alreadyWrapped.push(label);
      return;
    }
    if (value.type !== 'ArrayExpression') return;

    const didWrap = wrapArrayLiteral(state, value, label, names => `${WRAPPER}({ ${names.join(', ')} })`);
    if (didWrap && debug) {
      // eslint-disable-next-line no-console
      console.log(`[Sentry] Auto-wrapping ${label} in ${id}`);
    }
  });
}

function wrapStandalone(code: string, id: string, debug: boolean, findSites: SiteFinder): WrapResult {
  let ast: ProgramBody;
  try {
    ast = parseModule(code, id);
  } catch {
    return { code, didWrap: false, skipped: [] };
  }

  const state = createRewriteState(code);
  wrapSites({ ast, code, id, state }, findSites, debug);
  return { code: state.ms.toString(), didWrap: state.report.wrapped.length > 0, skipped: state.report.skipped };
}

/**
 * Wraps global middleware arrays (requestMiddleware, functionMiddleware) in createStart() files.
 */
export function wrapGlobalMiddleware(code: string, id: string, debug: boolean): WrapResult {
  return wrapStandalone(code, id, debug, findGlobalSites);
}

/**
 * Wraps route middleware arrays in createFileRoute() files.
 */
export function wrapRouteMiddleware(code: string, id: string, debug: boolean): WrapResult {
  return wrapStandalone(code, id, debug, findRouteSites);
}

/**
 * Wraps middleware arrays in createServerFn().middleware([...]) calls.
 */
export function wrapServerFnMiddleware(code: string, id: string, debug: boolean): WrapResult {
  return wrapStandalone(code, id, debug, findServerFnSites);
}

/**
 * A Vite plugin that automatically instruments TanStack Start middlewares:
 * - `requestMiddleware` and `functionMiddleware` arrays in `createStart()`
 * - `middleware` arrays in `createFileRoute()` route definitions
 * - `middleware` arrays in `createServerFn().middleware()` calls
 */
export function makeAutoInstrumentMiddlewarePlugin(options: AutoInstrumentMiddlewareOptions = {}): Plugin {
  const { enabled = true, debug = false } = options;

  const rule = (name: string, contains: string[], findSites: SiteFinder): RewriteRule => ({
    name,
    include: { id: SOURCE_FILE_REGEX, contains },
    apply: ctx => {
      wrapSites(ctx, findSites, debug);
      // The module may already bind the wrapper, e.g. through a re-export.
      if (ctx.state.needsImport && !collectDeclaringStatements(ctx.ast).has(WRAPPER)) {
        addImport(ctx.state, ctx.ast, `import { ${WRAPPER} } from '${SENTRY_MODULE}';`);
      }
    },
  });

  const rewriter = createCallSiteRewriter(
    [
      rule('global-middleware', ['createStart('], findGlobalSites),
      rule('route-middleware', ['createFileRoute(', 'middleware'], findRouteSites),
      rule('server-fn-middleware', ['createServerFn', '.middleware'], findServerFnSites),
    ],
    {
      logger: {
        warn: message =>
          // eslint-disable-next-line no-console
          console.warn(`${message} To instrument these middlewares, use wrapMiddlewaresWithSentry() manually. `),
      },
    },
  );

  return {
    name: 'sentry-tanstack-middleware-auto-instrument',
    enforce: 'pre',

    transform(code, id) {
      if (!enabled) {
        return null;
      }

      return rewriter.transform(code, id, this);
    },
  };
}
