import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bundlerParser, langFromId, loadParser, parseModule } from '../../src/rewriter/parse';

beforeAll(async () => {
  await loadParser();
});

describe('langFromId', () => {
  it.each([
    ['/a/b.js', 'js'],
    ['/a/b.mjs', 'js'],
    ['/a/b.cjs', 'js'],
    ['/a/b.jsx', 'jsx'],
    ['/a/b.ts', 'ts'],
    ['/a/b.mts', 'ts'],
    ['/a/b.cts', 'ts'],
    ['/a/b.tsx', 'tsx'],
    ['/a/b.ts?v=123', 'ts'],
    ['/a/b.tsx#hash', 'tsx'],
    ['/a/b.svelte', 'js'],
    ['virtual:module', 'js'],
  ])('%s → %s', (id, lang) => {
    expect(langFromId(id)).toBe(lang);
  });
});

describe('parseModule', () => {
  it('returns an ESTree program with offsets', () => {
    const code = 'export const a = 1;';
    const program = parseModule(code, 'a.js');
    const [statement] = program.body;
    expect(statement).toMatchObject({ type: 'ExportNamedDeclaration', start: 0, end: code.length });
  });

  it('parses TypeScript for a .ts id', () => {
    expect(() => parseModule('const a: number = 1;', 'a.ts')).not.toThrow();
  });

  it('rejects TypeScript for a .js id', () => {
    expect(() => parseModule('const a: number = 1;', 'a.js')).toThrow();
  });

  it('parses JSX for a .tsx id', () => {
    expect(() => parseModule('const a = <div />;', 'a.tsx')).not.toThrow();
  });

  it('throws on a syntax error', () => {
    expect(() => parseModule('const a = (', 'a.js')).toThrow();
  });
});

describe('bundlerParser', () => {
  it("parses with Rolldown's `this.parse`, in the dialect the id names", () => {
    const parse = vi.fn((input: string) => parseModule(input, 'module.ts'));
    const parser = bundlerParser({ meta: { rolldownVersion: '1.2.11' }, parse });

    parser!('const a: number = 1;', '/app/a.mts?v=1');
    expect(parse).toHaveBeenCalledWith('const a: number = 1;', { lang: 'ts', preserveParens: false });
  });

  it('is undefined for Rollup, whose `this.parse` cannot read TypeScript', () => {
    expect(bundlerParser({ meta: {}, parse: vi.fn() })).toBeUndefined();
  });

  it('is undefined without a context or a parse function', () => {
    expect(bundlerParser(undefined)).toBeUndefined();
    expect(bundlerParser({ meta: { rolldownVersion: '1.2.11' } })).toBeUndefined();
  });
});
