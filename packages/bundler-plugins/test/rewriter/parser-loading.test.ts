import { describe, expect, it, vi } from 'vitest';

const { gate } = vi.hoisted(() => {
  let release = (): void => {};
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { gate: { promise, release: () => release() } };
});

vi.mock('oxc-parser', async importOriginal => {
  await gate.promise;
  return importOriginal();
});

describe('the rewriter while `oxc-parser` loads', () => {
  it('waits for it on the first transform and stays synchronous after', async () => {
    const { createCallSiteRewriter, isParserLoading, wrapArrayLiteral, walk } = await import('../../src/rewriter');
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

    expect(isParserLoading()).toBe(true);
    const pending = rewriter.transform('f([a]);', '/app/a.ts');
    expect(pending).toBeInstanceOf(Promise);

    gate.release();
    expect((await pending)?.code).toBe('f(a);');
    expect(isParserLoading()).toBe(false);
    expect(rewriter.transform('f([b]);', '/app/b.ts')).toEqual(expect.objectContaining({ code: 'f(b);' }));
  });
});
