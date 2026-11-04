import { stripUrlQueryAndFragment } from '@sentry/core';
import type * as OxcParser from 'oxc-parser';
import type { ProgramBody } from './ast';

export type ModuleLang = 'js' | 'jsx' | 'ts' | 'tsx';

/** Parses a module into an ESTree program. Throws when the code does not parse. */
export type ModuleParser = (code: string, id: string) => ProgramBody;

/** The part of a bundler's plugin context that can parse code. */
export interface ParserContext {
  meta?: { rolldownVersion?: string };
  parse?(input: string, options?: object | null): unknown;
}

const PARSER_UNAVAILABLE_MESSAGE =
  '[@sentry/bundler-plugins] Could not load `oxc-parser` for this platform. ' +
  'Modules that need it will not be auto-instrumented.';

// `undefined` while loading, `null` when it failed to load.
let oxc: typeof OxcParser | null | undefined;
let warnedParserUnavailable = false;

// The import is dynamic so that a platform without an `oxc-parser` native
// binary gets a warning instead of a failed build.
const oxcLoaded: Promise<boolean> = import('oxc-parser').then(
  module => {
    oxc = module;
    return true;
  },
  () => {
    oxc = null;
    return false;
  },
);

/** Resolves once `oxc-parser` has loaded or failed to load, with whether it is available. */
export function loadParser(): Promise<boolean> {
  return oxcLoaded;
}

export function isParserLoading(): boolean {
  return oxc === undefined;
}

/** The source dialect a module id names by its extension. */
export function langFromId(id: string): ModuleLang {
  const extension = /\.([cm]?[jt]sx?)$/.exec(stripUrlQueryAndFragment(id))?.[1] ?? 'js';
  if (extension === 'tsx') return 'tsx';
  if (extension === 'jsx') return 'jsx';
  return extension.endsWith('ts') ? 'ts' : 'js';
}

/**
 * The default {@link ModuleParser}, over `oxc-parser`. Throws when `oxc-parser`
 * has not loaded; see {@link loadParser}.
 */
export function parseModule(code: string, id: string, lang: ModuleLang = langFromId(id)): ProgramBody {
  if (!oxc) {
    if (oxc === null && !warnedParserUnavailable) {
      warnedParserUnavailable = true;
      // eslint-disable-next-line no-console
      console.warn(PARSER_UNAVAILABLE_MESSAGE);
    }
    throw new Error(oxc === null ? PARSER_UNAVAILABLE_MESSAGE : '`oxc-parser` has not loaded yet');
  }

  // `preserveParens: false` matches the AST Vite produces.
  const { program, errors } = oxc.parseSync(id, code, { lang, sourceType: 'module', preserveParens: false });
  if (errors.length > 0) {
    throw new Error(errors[0]?.message);
  }
  return program;
}

/**
 * A parser over Rolldown's own `this.parse`, which reads TypeScript when told
 * the dialect. Rollup's `this.parse` cannot, so it is not used.
 */
export function bundlerParser(context: ParserContext | undefined): ModuleParser | undefined {
  if (!context?.meta?.rolldownVersion || typeof context.parse !== 'function') return undefined;
  return (code, id) => context.parse!(code, { lang: langFromId(id), preserveParens: false }) as ProgramBody;
}
