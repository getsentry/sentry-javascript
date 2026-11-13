import { beforeAll, describe, expect, it } from 'vitest';
import { shapeFromAst, shapeFromSource } from '../../src/rewriter/module-shape';
import { loadParser, parseModule } from '../../src/rewriter/parse';

beforeAll(async () => {
  await loadParser();
});

describe('shapeFromAst', () => {
  it('collects classes with their superclass', () => {
    const shape = shapeFromAst(
      parseModule(['class A extends B {}', 'export class C extends ns.D {}', 'class E {}'].join('\n'), 'module.js'),
    );
    expect(shape.classes).toEqual(
      new Map([
        ['A', { kind: 'identifier', name: 'B' }],
        ['C', { kind: 'member', object: 'ns', property: 'D' }],
        ['E', undefined],
      ]),
    );
  });

  it('collects named, default and namespace imports', () => {
    const shape = shapeFromAst(
      parseModule("import Def, { a as b, c } from 'm';\nimport * as ns from 'n';", 'module.js'),
    );
    expect(shape.imports).toEqual(
      new Map([
        ['Def', { source: 'm', imported: 'default' }],
        ['b', { source: 'm', imported: 'a' }],
        ['c', { source: 'm', imported: 'c' }],
      ]),
    );
    expect(shape.namespaces).toEqual(new Map([['ns', 'n']]));
  });

  it('collects local exports, re-exports and star exports', () => {
    const shape = shapeFromAst(
      parseModule(
        [
          'class A {}',
          'export { A as B };',
          'export { x as y, z as "w" } from \'./r\';',
          "export * from './s';",
          "export * as ns from './t';",
        ].join('\n'),
        'module.js',
      ),
    );
    expect(shape.localExports).toEqual(new Map([['B', 'A']]));
    expect(shape.reexports).toEqual(
      new Map([
        ['y', { source: './r', imported: 'x' }],
        ['w', { source: './r', imported: 'z' }],
      ]),
    );
    expect(shape.starExports).toEqual(['./s']);
  });

  it('records a declared default class', () => {
    const shape = shapeFromAst(parseModule('export default class A extends B {}', 'module.js'));
    expect(shape.defaultExportIsClass).toBe(true);
    expect(shape.defaultExportSuper).toEqual({ kind: 'identifier', name: 'B' });
    expect(shape.classes.has('A')).toBe(true);
  });

  it('records an anonymous default class', () => {
    const shape = shapeFromAst(parseModule('export default class extends B {}', 'module.js'));
    expect(shape.defaultExportIsClass).toBe(true);
    expect(shape.defaultExportSuper).toEqual({ kind: 'identifier', name: 'B' });
  });

  it('records a default export of an identifier', () => {
    const shape = shapeFromAst(parseModule('class A {}\nexport default A;', 'module.js'));
    expect(shape.defaultExportName).toBe('A');
    expect(shape.defaultExportIsClass).toBeUndefined();
  });
});

describe('shapeFromSource', () => {
  it('reads generic and abstract TypeScript classes', () => {
    const code = [
      "import { Agent } from 'agents';",
      'interface Props { name: string }',
      'export abstract class Base<T extends Map<string, number>> extends Agent<Env, Props> {',
      '  private field?: T;',
      '}',
    ].join('\n');
    const shape = shapeFromSource(code, '/app/base.ts');
    expect(shape?.classes).toEqual(new Map([['Base', { kind: 'identifier', name: 'Agent' }]]));
    expect(shape?.imports).toEqual(new Map([['Agent', { source: 'agents', imported: 'Agent' }]]));
  });

  it('skips type-only imports and exports', () => {
    const code = [
      "import type { A } from './a';",
      "import { type B, C } from './b';",
      "export type { D } from './d';",
      "export { type E, F } from './e';",
      "export type * from './g';",
    ].join('\n');
    const shape = shapeFromSource(code, '/app/mod.ts');
    expect([...shape!.imports.keys()]).toEqual(['C']);
    expect([...shape!.reexports.keys()]).toEqual(['F']);
    expect(shape!.starExports).toEqual([]);
  });

  it.each([
    ['TypeScript', "import { Agent } from 'agents';\nexport class Base<T> extends Agent<T> {}"],
    ['JSX', "import { Agent } from 'agents';\nconst el = <div />;\nexport class Base extends Agent {}"],
  ])('reads %s from a module whose id names JavaScript', (_, code) => {
    expect(shapeFromSource(code, '/app/base.js')?.classes.get('Base')).toEqual({ kind: 'identifier', name: 'Agent' });
  });

  it('returns undefined for code that does not parse', () => {
    expect(shapeFromSource('this is ) not ( javascript', '/app/broken.js')).toBeUndefined();
  });
});
