import { beforeAll, describe, expect, it } from 'vitest';
import { type BaseNode, walk } from '../../src/rewriter/ast';
import { wrapArrayLiteral } from '../../src/rewriter/arrays';
import { loadParser, parseModule } from '../../src/rewriter/parse';
import { createRewriteState, type RewriteState } from '../../src/rewriter/rewriter';

beforeAll(async () => {
  await loadParser();
});

const build = (names: string[]): string => `wrap({ ${names.join(', ')} })`;

/** Wraps the outermost array literal in `code`. */
function wrapFirstArray(code: string): { output: string; result: boolean; state: RewriteState } {
  const ast = parseModule(code, 'module.ts');
  let array: BaseNode | undefined;
  walk(ast, node => {
    if (!array && node.type === 'ArrayExpression') array = node;
  });
  const state = createRewriteState(code);
  const result = wrapArrayLiteral(state, array!, 'middleware', build);
  const output = state.ms.toString();
  expect(() => parseModule(output, 'module.ts')).not.toThrow();
  return { output, result, state };
}

describe('wrapArrayLiteral', () => {
  it('replaces an array of identifiers', () => {
    const { output, result, state } = wrapFirstArray('f({ middleware: [a, b] });');
    expect(result).toBe(true);
    expect(output).toBe('f({ middleware: wrap({ a, b }) });');
    expect(state.needsImport).toBe(true);
    expect(state.report.wrapped).toEqual(['middleware']);
  });

  it('removes duplicates and a trailing comma', () => {
    expect(wrapFirstArray('f([a, b, a,]);').output).toBe('f(wrap({ a, b }));');
  });

  it('spans lines and comments', () => {
    expect(wrapFirstArray('f([\n  a, // first\n  /* second */ b,\n]);').output).toBe('f(wrap({ a, b }));');
  });

  it('leaves an empty array alone without a skip', () => {
    const { output, result, state } = wrapFirstArray('f([]);');
    expect(result).toBe(false);
    expect(output).toBe('f([]);');
    expect(state.report.skipped).toEqual([]);
  });

  it.each([
    ['a call', 'f([getMiddleware()]);'],
    ['a nested array', 'f([a, [b]]);'],
    ['a spread', 'f([...middlewares]);'],
    ['a hole', 'f([a, , b]);'],
    ['a member expression', 'f([ns.a]);'],
  ])('skips an array holding %s', (_, code) => {
    const { output, result, state } = wrapFirstArray(code);
    expect(result).toBe(false);
    expect(output).toBe(code);
    expect(state.report.skipped).toEqual(['middleware']);
    expect(state.needsImport).toBe(false);
  });

  it('is not confused by a `]` inside a string elsewhere', () => {
    expect(wrapFirstArray("f([a], ']');").output).toBe("f(wrap({ a }), ']');");
  });
});
