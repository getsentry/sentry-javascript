import {
  addImport,
  type BaseNode,
  type CallExpressionNode,
  createCallSiteRewriter,
  createRewriteState,
  exportedName,
  hasImport,
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
const SOURCE_FILE_REGEX = /\.(ts|tsx|js|jsx|mjs|mts)$/;
const GLOBAL_MIDDLEWARE_KEYS = ['requestMiddleware', 'functionMiddleware'];

/** `requestMiddleware` and `functionMiddleware` properties inside a `createStart(...)` call. */
const findGlobalSites: SiteFinder = (ast, onSite) => {
  walk(ast, node => {
    if (!isCallToMethod(node, 'createStart')) return;
    walk((node as CallExpressionNode).arguments, inner => {
      const key = propertyKey(inner);
      if (key && GLOBAL_MIDDLEWARE_KEYS.includes(key)) onSite(key, (inner as PropertyNode).value!);
    });
  });
};

/** `middleware` properties, as route and handler options declare them. */
const findRouteSites: SiteFinder = (ast, onSite) => {
  walk(ast, node => {
    if (propertyKey(node) === 'middleware') onSite('middleware', (node as PropertyNode).value!);
  });
};

/** The argument of `.middleware(...)` calls, as `createServerFn()` chains make them. */
const findServerFnSites: SiteFinder = (ast, onSite) => {
  walk(ast, node => {
    const call = node as CallExpressionNode;
    if (
      call.callee?.type === 'MemberExpression' &&
      isCallToMethod(node, 'middleware') &&
      call.arguments?.length === 1
    ) {
      onSite('.middleware(', call.arguments[0]!);
    }
  });
};

function propertyKey(node: BaseNode): string | undefined {
  if (node.type !== 'Property') return undefined;
  const property = node as PropertyNode;
  return property.computed || !property.value ? undefined : exportedName(property.key);
}

/** Wraps each middleware array the finder reports, skipping values already wrapped. */
function wrapSites({ ast, id, state }: RuleContext, findSites: SiteFinder, debug: boolean): void {
  findSites(ast, (label, value) => {
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
      if (ctx.state.needsImport && !hasImport(ctx.ast, SENTRY_MODULE, WRAPPER)) {
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
