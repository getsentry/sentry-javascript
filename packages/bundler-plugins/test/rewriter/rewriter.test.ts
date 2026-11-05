import { beforeAll, describe, expect, it, vi } from 'vitest';
import { addImport } from '../../src/rewriter/imports';
import { wrapArrayLiteral } from '../../src/rewriter/arrays';
import { type BaseNode, walk } from '../../src/rewriter/ast';
import { loadParser, parseModule } from '../../src/rewriter/parse';
import { createCallSiteRewriter, type RewriteRule, type RuleContext } from '../../src/rewriter/rewriter';
import { parseAst } from 'rolldown/parseAst';

beforeAll(async () => {
  await loadParser();
});

function wrapArrays(ctx: RuleContext): void {
  walk(ctx.ast, node => {
    if (node.type === 'ArrayExpression') {
      wrapArrayLiteral(ctx.state, node, 'array', names => `wrap({ ${names.join(', ')} })`);
    }
  });
  if (ctx.state.needsImport) addImport(ctx.state, ctx.ast, "import { wrap } from 'sentry';");
}

const arrayRule: RewriteRule = { name: 'arrays', include: { id: /\.ts$/, contains: ['['] }, apply: wrapArrays };

describe('createCallSiteRewriter', () => {
  it('rewrites a matching module with a source map', () => {
    const result = createCallSiteRewriter([arrayRule]).transform('f([a]);', '/app/a.ts');
    expect(result).not.toBeInstanceOf(Promise);
    const { code, map } = result as { code: string; map: { mappings: string } };
    expect(code).toBe("import { wrap } from 'sentry';\nf(wrap({ a }));");
    expect(map.mappings).not.toBe('');
  });

  it('returns null when nothing changed', () => {
    expect(createCallSiteRewriter([arrayRule]).transform('f([]);', '/app/a.ts')).toBeNull();
  });

  it.each([
    ['the id does not match', 'f([a]);', '/app/a.css'],
    ['the source lacks a substring', 'f(a);', '/app/a.ts'],
  ])('does not parse when %s', (_, code, id) => {
    const parse = vi.fn(parseModule);
    expect(createCallSiteRewriter([arrayRule], { parse }).transform(code, id)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('matches on the basename', () => {
    const rule: RewriteRule = { ...arrayRule, include: { basename: /^\+page\.ts$/ } };
    const rewriter = createCallSiteRewriter([rule]);
    expect(rewriter.transform('f([a]);', '/app/routes/+page.ts')).not.toBeNull();
    expect(rewriter.transform('f([a]);', '/app/+page.ts/other.ts')).toBeNull();
  });

  it('returns null when the module does not parse', () => {
    expect(createCallSiteRewriter([arrayRule]).transform('f([a);', '/app/a.ts')).toBeNull();
  });

  it('uses the given parser', () => {
    const parse = vi.fn(parseModule);
    createCallSiteRewriter([arrayRule], { parse }).transform('f([a]);', '/app/a.ts');
    expect(parse).toHaveBeenCalledWith('f([a]);', '/app/a.ts');
  });

  it("parses with Rolldown's `this.parse` when the context is Rolldown's", () => {
    const parse = vi.fn(parseAst);
    const context = { meta: { rolldownVersion: '1.2.11' }, parse };
    const code = 'const a: string[] = [];\nf([a]);';

    const result = createCallSiteRewriter([arrayRule]).transform(code, '/app/a.ts', context);
    expect(parse).toHaveBeenCalledWith(code, { lang: 'ts', preserveParens: false });
    expect((result as { code: string }).code).toBe(
      (createCallSiteRewriter([arrayRule]).transform(code, '/app/a.ts') as { code: string }).code,
    );
  });

  it("does not use Rollup's `this.parse`", () => {
    const parse = vi.fn();
    createCallSiteRewriter([arrayRule]).transform('f([a]);', '/app/a.ts', { meta: {}, parse });
    expect(parse).not.toHaveBeenCalled();
  });

  it('prefers the parser given in the options over the context', () => {
    const parse = vi.fn(parseModule);
    const contextParse = vi.fn();
    createCallSiteRewriter([arrayRule], { parse }).transform('f([a]);', '/app/a.ts', {
      meta: { rolldownVersion: '1.2.11' },
      parse: contextParse,
    });
    expect(parse).toHaveBeenCalled();
    expect(contextParse).not.toHaveBeenCalled();
  });

  it('runs every matching rule on one parse and one set of edits', () => {
    const parse = vi.fn(parseModule);
    const second: RewriteRule = {
      name: 'second',
      include: {},
      apply: ({ state, ast }) => addImport(state, ast, "import 'second';"),
    };
    const result = createCallSiteRewriter([arrayRule, second], { parse }).transform('f([a]);', '/app/a.ts');
    expect(parse).toHaveBeenCalledTimes(1);
    expect((result as { code: string }).code).toBe("import { wrap } from 'sentry';\nimport 'second';\nf(wrap({ a }));");
  });

  it('returns a promise once a rule is async, and runs the later rules after it', async () => {
    const order: string[] = [];
    const rules: RewriteRule[] = [
      {
        name: 'async',
        include: {},
        apply: async () => {
          await Promise.resolve();
          order.push('async');
        },
      },
      { name: 'sync', include: {}, apply: ctx => (order.push('sync'), wrapArrays(ctx)) },
    ];
    const result = createCallSiteRewriter(rules).transform('f([a]);', '/app/a.ts');
    expect(result).toBeInstanceOf(Promise);
    expect((await result)?.code).toContain('wrap({ a })');
    expect(order).toEqual(['async', 'sync']);
  });

  it('warns about skipped sites, also when nothing changed', () => {
    const warn = vi.fn();
    const result = createCallSiteRewriter([arrayRule], { logger: { warn } }).transform('f([g()]);', '/app/a.ts');
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith('[Sentry] Could not auto-instrument array in /app/a.ts.');
  });

  it('hands each rule the module', () => {
    let seen: Partial<RuleContext> = {};
    const rule: RewriteRule = { name: 'spy', include: {}, apply: ctx => void (seen = ctx) };
    createCallSiteRewriter([rule]).transform('const a = 1;', '/app/a.ts');
    expect(seen.code).toBe('const a = 1;');
    expect(seen.id).toBe('/app/a.ts');
    expect((seen.ast?.body[0] as BaseNode).type).toBe('VariableDeclaration');
  });
});
