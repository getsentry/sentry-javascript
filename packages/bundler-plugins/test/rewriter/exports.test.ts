import { beforeAll, describe, expect, it } from 'vitest';
import type { ExportDefaultNode, ExportNamedNode, ProgramBody } from '../../src/rewriter/ast';
import { exportedName } from '../../src/rewriter/ast';
import {
  collectDeclaringStatements,
  collectManuallyWrappedLocals,
  collectTopLevelClasses,
  findNamedExports,
  wrapDefaultExport,
  wrapDefaultReexport,
  wrapDefaultSpecifier,
  wrapForeignExport,
  wrapInlineExport,
  wrapLocalBinding,
  wrapSpecifierExports,
} from '../../src/rewriter/exports';
import { loadParser, parseModule } from '../../src/rewriter/parse';
import { createRewriteState, type RewriteState } from '../../src/rewriter/rewriter';

beforeAll(async () => {
  await loadParser();
});

const wrap = (target: string): string => `wrap(${target})`;

/** Runs `edit` on `code` and returns the result, which must still parse. */
function rewrite(code: string, edit: (state: RewriteState, ast: ProgramBody) => void, id = 'module.ts'): string {
  const ast = parseModule(code, id);
  const state = createRewriteState(code);
  edit(state, ast);
  const output = state.ms.toString();
  expect(() => parseModule(output, id)).not.toThrow();
  return output;
}

function defaultExportOf(ast: ProgramBody): ExportDefaultNode {
  return ast.body.find(node => node.type === 'ExportDefaultDeclaration') as ExportDefaultNode;
}

function namedExportsOf(ast: ProgramBody): ExportNamedNode[] {
  return ast.body.filter(node => node.type === 'ExportNamedDeclaration') as ExportNamedNode[];
}

describe('collectors', () => {
  const ast = parseModule(
    [
      "import { imported } from './a';",
      'class Local {}',
      'export class Exported {}',
      'const handWrapped = wrap(Local);',
      'export const alsoHandWrapped = ns.wrap(Local), plain = 1;',
      'function fn() {}',
    ].join('\n'),
    'module.js',
  );

  it('collects top-level classes, exported or not', () => {
    expect([...collectTopLevelClasses(ast).keys()]).toEqual(['Local', 'Exported']);
  });

  it('maps each top-level binding to its declaring statement', () => {
    const statements = collectDeclaringStatements(ast);
    expect([...statements.keys()]).toEqual([
      'imported',
      'Local',
      'Exported',
      'handWrapped',
      'alsoHandWrapped',
      'plain',
      'fn',
    ]);
    expect(statements.get('plain')).toBe(ast.body[4]);
  });

  it('collects bindings assigned a call to a wrapper', () => {
    expect(collectManuallyWrappedLocals(ast, ['wrap'])).toEqual(new Set(['handWrapped', 'alsoHandWrapped']));
    expect(collectManuallyWrappedLocals(ast, ['other'])).toEqual(new Set());
  });
});

describe('findNamedExports', () => {
  function find(code: string): string[] {
    return findNamedExports(parseModule(code, 'module.ts'), 'load').map(node => code.slice(node.start, node.end));
  }

  it.each([
    'export const load = () => {};',
    'export async function load() {}',
    'export let { load } = obj;',
    'export { load };',
    'export { other as load };',
    'export { other as "load" };',
    "export { load } from './shared';",
  ])('finds %s', code => {
    expect(find(code)).toEqual([code]);
  });

  it.each([
    'export const loader = () => {};',
    'export type { load };',
    'export { type load };',
    'export interface load {}',
    'const load = 1;',
    'export { load as other };',
  ])('does not find %s', code => {
    expect(find(code)).toEqual([]);
  });
});

describe('wrapLocalBinding', () => {
  it('binds the wrapper after the declaration and reuses it', () => {
    const output = rewrite('class A {}\nexport { A };', (state, ast) => {
      expect(wrapLocalBinding(state, 'A', ast.body[0]!, wrap)).toBe('__SENTRY_WRAPPED_A__');
      expect(wrapLocalBinding(state, 'A', ast.body[0]!, wrap)).toBe('__SENTRY_WRAPPED_A__');
      expect(state.needsImport).toBe(true);
    });
    expect(output).toBe('class A {}\nconst __SENTRY_WRAPPED_A__ = wrap(A);\n\nexport { A };');
  });
});

describe('wrapInlineExport', () => {
  it('wraps an exported class without renaming it', () => {
    const output = rewrite('export class A {}', (state, ast) => {
      expect(wrapInlineExport(state, namedExportsOf(ast)[0]!, 'A', wrap)).toBe(true);
    });
    expect(output).toBe('class A {}\nconst __SENTRY_WRAPPED_A__ = wrap(A);\nexport { __SENTRY_WRAPPED_A__ as A };\n');
  });

  it('wraps an exported function', () => {
    const output = rewrite('export async function load() {}', (state, ast) => {
      wrapInlineExport(state, namedExportsOf(ast)[0]!, 'load', wrap);
    });
    expect(output).toContain('async function load() {}');
    expect(output).toContain('const __SENTRY_WRAPPED_load__ = wrap(load);');
    expect(output).toContain('export { __SENTRY_WRAPPED_load__ as load };');
  });

  it('keeps the other names of the same declaration exported', () => {
    const output = rewrite('export const load = () => {}, prerender = true;', (state, ast) => {
      wrapInlineExport(state, namedExportsOf(ast)[0]!, 'load', wrap);
    });
    expect(output).toMatch(/^const load = \(\) => \{\}, prerender = true;/);
    expect(output).toContain('export { __SENTRY_WRAPPED_load__ as load, prerender };');
  });

  it('keeps TypeScript annotations', () => {
    const output = rewrite('export const load: PageLoad = async () => ({});', (state, ast) => {
      wrapInlineExport(state, namedExportsOf(ast)[0]!, 'load', wrap);
    });
    expect(output).toContain('const load: PageLoad = async () => ({});');
  });

  it('returns false when the declaration does not declare the name', () => {
    const output = rewrite('export const other = 1;', (state, ast) => {
      expect(wrapInlineExport(state, namedExportsOf(ast)[0]!, 'load', wrap)).toBe(false);
    });
    expect(output).toBe('export const other = 1;');
  });
});

describe('wrapSpecifierExports', () => {
  function wrapNamed(code: string, name: string): string {
    return rewrite(code, (state, ast) => {
      const declaring = collectDeclaringStatements(ast);
      for (const node of namedExportsOf(ast)) {
        wrapSpecifierExports(state, node, (specifier, sourceLiteral, prelude) => {
          const exported = exportedName(specifier.exported);
          const local = exportedName(specifier.local);
          if (exported !== name || !local) return undefined;
          if (sourceLiteral) return wrapForeignExport(state, local, exported, sourceLiteral, prelude, wrap);
          return `${wrapLocalBinding(state, local, declaring.get(local)!, wrap)} as ${exported}`;
        });
      }
    });
  }

  it('re-points a local specifier and keeps the others', () => {
    const output = wrapNamed('function load() {}\nconst other = 1;\nexport { load, other };', 'load');
    expect(output).toBe(
      [
        'function load() {}',
        'const __SENTRY_WRAPPED_load__ = wrap(load);',
        '',
        'const other = 1;',
        'export { __SENTRY_WRAPPED_load__ as load };',
        'export { other };',
      ].join('\n'),
    );
  });

  it('re-points an aliased specifier', () => {
    const output = wrapNamed('const impl = () => {};\nexport { impl as load };', 'load');
    expect(output).toContain('const __SENTRY_WRAPPED_impl__ = wrap(impl);');
    expect(output).toContain('export { __SENTRY_WRAPPED_impl__ as load };');
  });

  it('re-points a string literal export name', () => {
    const output = wrapNamed('const impl = () => {};\nexport { impl as "load" };', 'load');
    expect(output).toContain('export { __SENTRY_WRAPPED_impl__ as load };');
  });

  it('binds a re-export under a private name', () => {
    const output = wrapNamed("export { load, other } from './shared';", 'load');
    expect(output).toBe(
      [
        "import { load as __SENTRY_REEXPORT_load__ } from './shared';",
        'const __SENTRY_WRAPPED_load__ = wrap(__SENTRY_REEXPORT_load__);',
        'export { __SENTRY_WRAPPED_load__ as load };',
        "export { other } from './shared';",
      ].join('\n'),
    );
  });

  it('wraps an imported binding that is exported again', () => {
    const output = wrapNamed("import { load } from './shared';\nexport { load };", 'load');
    expect(output).toContain("import { load } from './shared';\nconst __SENTRY_WRAPPED_load__ = wrap(load);");
  });

  it('leaves type-only exports alone', () => {
    const code = "export type { load } from './types';\nexport { type load as other } from './types';";
    expect(wrapNamed(code, 'load')).toBe(code);
  });

  it('leaves the statement alone when nothing matches', () => {
    const code = 'const a = 1;\nexport { a };';
    expect(wrapNamed(code, 'load')).toBe(code);
  });
});

describe('wrapDefaultExport', () => {
  function wrapDefault(code: string): string {
    return rewrite(code, (state, ast) => wrapDefaultExport(state, defaultExportOf(ast), wrap), 'module.js');
  }

  it('wraps an object-literal default export', () => {
    expect(wrapDefault('export default { fetch() {} };')).toBe(
      [
        'var __SENTRY_DEFAULT_EXPORT__ = { fetch() {} };',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = wrap(__SENTRY_DEFAULT_EXPORT__);',
      ].join('\n'),
    );
  });

  it('wraps a default export of an identifier', () => {
    expect(wrapDefault('const handler = {};\nexport default handler;')).toContain(
      'var __SENTRY_DEFAULT_EXPORT__ = handler;',
    );
  });

  it('keeps a declared default class bound under its name', () => {
    expect(wrapDefault('export default class Handler {}')).toBe(
      [
        'class Handler {}',
        'var __SENTRY_DEFAULT_EXPORT__ = Handler;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = wrap(Handler);',
      ].join('\n'),
    );
  });

  it('keeps the name `default` for an anonymous class', () => {
    expect(wrapDefault('export default class {}')).toBe(
      [
        'var __SENTRY_DEFAULT_EXPORT__ = { default: class {} }.default;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = wrap(__SENTRY_DEFAULT_EXPORT__);',
      ].join('\n'),
    );
  });

  it('wraps an anonymous function without a trailing semicolon', () => {
    expect(wrapDefault('export default function () {}')).toContain(
      'var __SENTRY_DEFAULT_EXPORT__ = { default: function () {} }.default;',
    );
  });

  it.each([
    [
      'a block comment',
      'export /* default handler */ default /* the default */ { fetch() {} };',
      'var __SENTRY_DEFAULT_EXPORT__ = /* the default */ { fetch() {} };',
    ],
    [
      'a line comment',
      'export // default handler\ndefault { fetch() {} };',
      'var __SENTRY_DEFAULT_EXPORT__ = { fetch() {} };',
    ],
  ])('finds the `default` keyword past %s that names it', (_, code, expected) => {
    expect(wrapDefault(code)).toContain(expected);
  });

  it('re-points the default export at an existing wrapper binding', () => {
    const output = rewrite(
      'class A {}\nexport default A;',
      (state, ast) => {
        wrapLocalBinding(state, 'A', ast.body[0]!, wrap);
        wrapDefaultExport(state, defaultExportOf(ast), wrap);
      },
      'module.js',
    );
    expect(output).toBe('class A {}\nconst __SENTRY_WRAPPED_A__ = wrap(A);\n\nexport default __SENTRY_WRAPPED_A__;');
  });
});

describe('wrapDefaultSpecifier', () => {
  it('binds the default where the local is declared and wraps it at the end', () => {
    const output = rewrite(
      'const handler = {};\nexport { handler as default };',
      (state, ast) => {
        const statement = collectDeclaringStatements(ast).get('handler');
        wrapSpecifierExports(state, namedExportsOf(ast)[0]!, specifier =>
          wrapDefaultSpecifier(state, exportedName(specifier.local)!, statement, wrap),
        );
      },
      'module.js',
    );
    expect(output).toBe(
      [
        'const handler = {};',
        'var __SENTRY_DEFAULT_EXPORT__ = handler;',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
        '__SENTRY_DEFAULT_EXPORT__ = wrap(handler);',
      ].join('\n'),
    );
  });

  it('declares the binding at the end when the local has no declaring statement', () => {
    const output = rewrite(
      'export { handler as default };\nvar handler = {};',
      (state, ast) => {
        wrapSpecifierExports(state, namedExportsOf(ast)[0]!, () =>
          wrapDefaultSpecifier(state, 'handler', undefined, wrap),
        );
      },
      'module.js',
    );
    expect(output).toContain('var __SENTRY_DEFAULT_EXPORT__ = wrap(handler);');
  });
});

describe('wrapDefaultReexport', () => {
  it.each([
    ["export { default } from './handler';", "import __SENTRY_REEXPORT_default__ from './handler';"],
    [
      "export { handler as default } from './handler';",
      "import { handler as __SENTRY_REEXPORT_default__ } from './handler';",
    ],
  ])('wraps %s', (code, importStatement) => {
    const output = rewrite(
      code,
      (state, ast) => {
        wrapSpecifierExports(state, namedExportsOf(ast)[0]!, (specifier, sourceLiteral, prelude) =>
          wrapDefaultReexport(state, exportedName(specifier.local)!, sourceLiteral!, prelude, wrap),
        );
      },
      'module.js',
    );
    expect(output).toBe(
      [
        importStatement,
        'var __SENTRY_DEFAULT_EXPORT__ = wrap(__SENTRY_REEXPORT_default__);',
        'export { __SENTRY_DEFAULT_EXPORT__ as default };',
      ].join('\n'),
    );
  });
});
