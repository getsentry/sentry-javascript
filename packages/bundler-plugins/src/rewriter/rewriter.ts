import { basename } from 'node:path';
import MagicString, { type SourceMap } from 'magic-string';
import type { ProgramBody } from './ast';
import {
  bundlerParser,
  isParserLoading,
  loadParser,
  type ModuleParser,
  parseModule,
  type ParserContext,
} from './parse';
import { createReport, formatReport, type RewriteReport } from './report';

/** The edits a rewrite makes to one module, shared by every rule that runs on it. */
export interface RewriteState {
  /** Positions are always relative to the original source. */
  ms: MagicString;
  /** Set once the rewritten code references a binding the caller must import. */
  needsImport: boolean;
  /** Local binding name → the binding that holds its wrapper. */
  wrappedLocals: Map<string, string>;
  /** Import statements already added to this module. */
  imports: Set<string>;
  report: RewriteReport;
}

export function createRewriteState(code: string): RewriteState {
  return {
    ms: new MagicString(code),
    needsImport: false,
    wrappedLocals: new Map(),
    imports: new Set(),
    report: createReport(),
  };
}

/** Which modules a rule runs on. Every given condition must hold. */
export interface RuleInclude {
  /** Tested against the full module id. */
  id?: RegExp;
  /** Tested against the last path segment of the module id. */
  basename?: RegExp;
  /** Substrings the source must contain, checked before parsing. */
  contains?: string[];
}

export interface RuleContext {
  ast: ProgramBody;
  code: string;
  id: string;
  state: RewriteState;
}

export interface RewriteRule {
  name: string;
  include: RuleInclude;
  apply(ctx: RuleContext): void | Promise<void>;
}

export interface RewriterOptions {
  /**
   * Defaults to Rolldown's `this.parse` when the transform gets a Rolldown
   * plugin context, and to {@link parseModule} otherwise.
   */
  parse?: ModuleParser;
  /** Receives the warning for sites a rule could not wrap. */
  logger?: { warn(message: string): void };
}

export interface RewriteOutput {
  code: string;
  map: SourceMap;
}

export interface CallSiteRewriter {
  /**
   * Runs every matching rule on one module. Returns `null` when nothing
   * changed. The result is a promise only while `oxc-parser` is still
   * loading, or when a rule's `apply` returns one.
   *
   * @param context the bundler's plugin context, for its parser
   */
  transform(code: string, id: string, context?: ParserContext): RewriteOutput | null | Promise<RewriteOutput | null>;
}

export function createCallSiteRewriter(rules: RewriteRule[], options: RewriterOptions = {}): CallSiteRewriter {
  const rewrite = (
    matching: RewriteRule[],
    code: string,
    id: string,
    parse: ModuleParser,
  ): RewriteOutput | null | Promise<RewriteOutput | null> => {
    let ast: ProgramBody;
    try {
      ast = parse(code, id);
    } catch {
      return null;
    }

    const state = createRewriteState(code);
    const ctx: RuleContext = { ast, code, id, state };
    const finish = (): RewriteOutput | null => {
      const warning = formatReport(state.report, id);
      if (warning) options.logger?.warn(warning);
      if (!state.ms.hasChanged()) return null;
      return { code: state.ms.toString(), map: state.ms.generateMap({ hires: true }) };
    };

    const pending = applyRules(matching, ctx, 0);
    return pending ? pending.then(finish) : finish();
  };

  return {
    transform(code, id, context) {
      const matching = rules.filter(rule => matches(rule.include, code, id));
      if (matching.length === 0) return null;

      const parse = options.parse ?? bundlerParser(context) ?? parseModule;
      // Rules may parse other modules with `parseModule`, so it has to be ready
      // whichever parser reads this one.
      if (isParserLoading()) {
        return loadParser().then(() => rewrite(matching, code, id, parse));
      }
      return rewrite(matching, code, id, parse);
    },
  };
}

function matches(include: RuleInclude, code: string, id: string): boolean {
  if (include.id && !include.id.test(id)) return false;
  if (include.basename && !include.basename.test(basename(id))) return false;
  if (include.contains && !include.contains.every(substring => code.includes(substring))) return false;
  return true;
}

/** Applies the rules in order, staying synchronous until a rule returns a promise. */
function applyRules(rules: RewriteRule[], ctx: RuleContext, from: number): Promise<void> | undefined {
  for (let index = from; index < rules.length; index++) {
    const pending = rules[index]!.apply(ctx);
    if (pending instanceof Promise) {
      return pending.then(() => applyRules(rules, ctx, index + 1));
    }
  }
  return undefined;
}
