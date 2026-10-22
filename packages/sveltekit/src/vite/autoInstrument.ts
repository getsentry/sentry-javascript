import {
  addImport,
  collectDeclaringStatements,
  collectManuallyWrappedLocals,
  createCallSiteRewriter,
  exportedName,
  findNamedExports,
  hasImport,
  type RewriteRule,
  type RuleContext,
  wrapForeignExport,
  wrapInlineExport,
  wrapLocalBinding,
  wrapSpecifierExports,
} from '@sentry/bundler-plugins/rewriter';
import type { Plugin } from 'vite';
import type { ResolvedKitConfig } from './kitConfig';
import { isNativeServerTracingEnabled } from './kitConfig';

export type AutoInstrumentSelection = {
  /**
   * If this flag is `true`, the Sentry plugins will automatically instrument the `load` function of
   * your universal `load` functions declared in your `+page.(js|ts)` and `+layout.(js|ts)` files.
   *
   * @default true
   */
  load?: boolean;

  /**
   * If this flag is `true`, the Sentry plugins will automatically instrument the `load` function of
   * your server-only `load` functions declared in your `+page.server.(js|ts)`
   * and `+layout.server.(js|ts)` files.
   *
   * @default true
   */
  serverLoad?: boolean;
};

type AutoInstrumentPluginOptions = AutoInstrumentSelection & {
  debug: boolean;
  getKitConfig: () => Promise<ResolvedKitConfig>;
};

type LoadWrapper = 'wrapLoadWithSentry' | 'wrapServerLoadWithSentry';

const LOAD_WRAPPERS: readonly LoadWrapper[] = ['wrapLoadWithSentry', 'wrapServerLoadWithSentry'];

/**
 * Creates a Vite plugin that automatically instruments the parts of the app
 * specified in @param options. This includes
 *
 * - universal `load` functions from `+page.(js|ts)` and `+layout.(js|ts)` files
 * - server-only `load` functions from `+page.server.(js|ts)` and `+layout.server.(js|ts)` files
 *
 * @returns the plugin
 */
export function makeAutoInstrumentationPlugin(options: AutoInstrumentPluginOptions): Plugin {
  const { load: wrapLoadEnabled, serverLoad: wrapServerLoadEnabled, debug, getKitConfig } = options;

  let isServerBuild: boolean | undefined = undefined;

  // Whether we should skip server-side load instrumentation because SvelteKit's native server
  // tracing is enabled. If it is, adding our own wrapper on top would emit duplicate spans.
  let onlyInstrumentClientPromise: Promise<boolean> | undefined;
  const shouldOnlyInstrumentClient = (): Promise<boolean> =>
    (onlyInstrumentClientPromise ??= getKitConfig().then(isNativeServerTracingEnabled));

  const universalRules = wrapLoadEnabled
    ? [loadRule(/^\+(page|layout)\.(js|ts|mjs|mts)$/, 'wrapLoadWithSentry', debug)]
    : [];
  const serverRules = wrapServerLoadEnabled
    ? [loadRule(/^\+(page|layout)\.server\.(js|ts|mjs|mts)$/, 'wrapServerLoadWithSentry', debug)]
    : [];
  const universalRewriter = createCallSiteRewriter(universalRules);
  const rewriter = createCallSiteRewriter([...universalRules, ...serverRules]);

  return {
    name: 'sentry-auto-instrumentation',
    // This plugin needs to run as early as possible, before the SvelteKit plugin virtualizes all paths and ids
    enforce: 'pre',

    configResolved: config => {
      // The SvelteKit plugins trigger additional builds within the main (SSR) build.
      // We just need a mechanism to upload source maps only once.
      // `config.build.ssr` is `true` for that first build and `false` in the other ones.
      // Hence we can use it as a switch to upload source maps only once in main build.
      isServerBuild = !!config.build.ssr;
    },

    async transform(code, id) {
      // On Vite 6+ `config.build.ssr` captured in `configResolved` no longer reliably reflects the per-environment build.
      // Prefer the environment of the current build (`this.environment.name === 'ssr'`) and fall back to
      // `isServerBuild` for older Vite versions that don't expose environments.
      const environmentName = (this as { environment?: { name?: string } }).environment?.name;
      const isServerEnvironment = environmentName != null ? environmentName === 'ssr' : !!isServerBuild;

      const onlyInstrumentClient = await shouldOnlyInstrumentClient();
      if (isServerEnvironment && onlyInstrumentClient) {
        return null;
      }

      return (onlyInstrumentClient ? universalRewriter : rewriter).transform(code, id, this);
    },
  };
}

function loadRule(basename: RegExp, wrapper: LoadWrapper, debug: boolean): RewriteRule {
  return {
    name: wrapper,
    include: { basename, contains: ['load'] },
    apply: ctx => {
      if (wrapLoadExport(ctx, wrapper)) {
        // eslint-disable-next-line no-console
        debug && console.log(`Wrapping ${ctx.id} with Sentry load wrapper`);
      }
    },
  };
}

/**
 * Wraps the module's `load` export in place, in any export form, unless the
 * user already wrapped it.
 *
 * @returns whether the export was wrapped
 */
function wrapLoadExport({ ast, state }: RuleContext, wrapper: LoadWrapper): boolean {
  const handWrapped = collectManuallyWrappedLocals(ast, LOAD_WRAPPERS);
  const declaringStatements = collectDeclaringStatements(ast);
  const wrap = (target: string): string => `${wrapper}(${target})`;
  let wrapped = false;

  for (const node of findNamedExports(ast, 'load')) {
    if (node.declaration) {
      if (handWrapped.has('load')) {
        state.report.alreadyWrapped.push('load');
      } else if (wrapInlineExport(state, node, 'load', wrap)) {
        wrapped = true;
      }
      continue;
    }

    wrapSpecifierExports(state, node, (specifier, sourceLiteral, prelude) => {
      const local = specifier.local?.type === 'Identifier' ? specifier.local.name : undefined;
      if (exportedName(specifier.exported) !== 'load' || !local) return undefined;

      if (sourceLiteral) {
        wrapped = true;
        return wrapForeignExport(state, local, 'load', sourceLiteral, prelude, wrap);
      }

      const declaringStatement = declaringStatements.get(local);
      if (handWrapped.has(local)) {
        state.report.alreadyWrapped.push('load');
        return undefined;
      }
      if (!declaringStatement) return undefined;

      wrapped = true;
      return `${wrapLocalBinding(state, local, declaringStatement, wrap)} as load`;
    });
  }

  if (wrapped) {
    state.report.wrapped.push('load');
    if (!hasImport(ast, '@sentry/sveltekit', wrapper)) {
      addImport(state, ast, `import { ${wrapper} } from '@sentry/sveltekit';`);
    }
  }
  return wrapped;
}
