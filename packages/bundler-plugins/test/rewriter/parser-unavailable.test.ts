import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('oxc-parser', () => {
  throw new Error('Cannot find native binding.');
});

const MESSAGE =
  '[@sentry/bundler-plugins] Could not load `oxc-parser` for this platform. ' +
  'Modules that need it will not be auto-instrumented.';

describe('the rewriter without `oxc-parser`', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves modules unchanged and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createCallSiteRewriter, loadParser, shapeFromSource, wrapArrayLiteral, walk } =
      await import('../../src/rewriter');
    const rewriter = createCallSiteRewriter([
      {
        name: 'arrays',
        include: {},
        apply: ({ ast, state }) =>
          walk(ast, node => {
            if (node.type === 'ArrayExpression') wrapArrayLiteral(state, node, 'array', names => names.join());
          }),
      },
    ]);

    // A transform that starts while the import is still pending waits for it.
    expect(await rewriter.transform('f([a]);', '/app/a.ts')).toBeNull();
    await expect(loadParser()).resolves.toBe(false);
    expect(rewriter.transform('f([b]);', '/app/b.ts')).toBeNull();
    expect(shapeFromSource('export class A {}', '/app/c.ts')).toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(MESSAGE);
  });

  it("still parses with Rolldown's `this.parse`", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createCallSiteRewriter, loadParser } = await import('../../src/rewriter');
    const { parseAst } = await import('rolldown/parseAst');
    await loadParser();

    const rewriter = createCallSiteRewriter([
      { name: 'edit', include: {}, apply: ({ state }) => void state.ms.append('\n// edited') },
    ]);
    const context = { meta: { rolldownVersion: '1.2.11' }, parse: parseAst };
    expect(rewriter.transform('const a: number = 1;', '/app/a.ts', context)).toEqual(
      expect.objectContaining({ code: 'const a: number = 1;\n// edited' }),
    );
  });
});
