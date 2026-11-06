import { beforeAll, describe, expect, it } from 'vitest';
import {
  type BaseNode,
  declaredNames,
  directivesEnd,
  exportedName,
  type ExportNamedNode,
  isAnonymousFunctionOrClass,
  isCallToMethod,
  isTypeOnlyExport,
  walk,
} from '../../src/rewriter/ast';
import { loadParser, parseModule } from '../../src/rewriter/parse';

beforeAll(async () => {
  await loadParser();
});

function firstStatement(code: string, id = 'module.ts'): BaseNode {
  return parseModule(code, id).body[0]!;
}

function expressionOf(code: string): BaseNode {
  return (firstStatement(code) as BaseNode & { expression: BaseNode }).expression;
}

describe('isCallToMethod', () => {
  it('matches a bare call', () => {
    expect(isCallToMethod(expressionOf('wrap(x);'), 'wrap')).toBe(true);
  });

  it('matches a member call', () => {
    expect(isCallToMethod(expressionOf('Sentry.wrap(x);'), 'wrap')).toBe(true);
  });

  it('does not match another function or a non-call', () => {
    expect(isCallToMethod(expressionOf('other(x);'), 'wrap')).toBe(false);
    expect(isCallToMethod(expressionOf('wrap;'), 'wrap')).toBe(false);
  });
});

describe('isAnonymousFunctionOrClass', () => {
  it.each([
    ['() => {}', true],
    ['(function () {})', true],
    ['(class {})', true],
    ['(function named() {})', false],
    ['(class Named {})', false],
    ['({})', false],
  ])('%s → %s', (code, expected) => {
    expect(isAnonymousFunctionOrClass(expressionOf(`${code};`))).toBe(expected);
  });
});

describe('isTypeOnlyExport', () => {
  it('detects `export type { X }`', () => {
    expect(isTypeOnlyExport(firstStatement("export type { X } from './x';") as ExportNamedNode)).toBe(true);
  });

  it('detects an inline `type` specifier', () => {
    const node = firstStatement("export { type X, Y } from './x';") as ExportNamedNode;
    expect(isTypeOnlyExport(node)).toBe(false);
    expect(node.specifiers!.map(isTypeOnlyExport)).toEqual([true, false]);
  });
});

describe('exportedName', () => {
  it('reads identifier and string literal names', () => {
    const node = firstStatement('export { a as b, c as "load" } from \'./x\';') as ExportNamedNode;
    expect(node.specifiers!.map(specifier => exportedName(specifier.exported))).toEqual(['b', 'load']);
  });
});

describe('directivesEnd', () => {
  it('is 0 without directives', () => {
    expect(directivesEnd(parseModule('const a = 1;', 'module.js'))).toBe(0);
  });

  it('ends after the last directive', () => {
    const code = '\'use strict\';\n"use server";\nconst a = 1;';
    expect(code.slice(0, directivesEnd(parseModule(code, 'module.js')))).toBe('\'use strict\';\n"use server";');
  });

  it('ends after a hashbang', () => {
    const code = '#!/usr/bin/env node\nconst a = 1;';
    expect(code.slice(0, directivesEnd(parseModule(code, 'module.js')))).toBe('#!/usr/bin/env node');
  });

  it('ignores a string statement after other code', () => {
    const code = "const a = 1;\n'use server';";
    expect(directivesEnd(parseModule(code, 'module.js'))).toBe(0);
  });
});

describe('declaredNames', () => {
  it.each([
    ['export class A {}', ['A']],
    ['export function a() {}', ['a']],
    ['export const a = 1, b = 2;', ['a', 'b']],
    ['export const { a, b: c, ...d } = x;', ['a', 'c', 'd']],
    ['export const [a, [b], c = 1, ...d] = x;', ['a', 'b', 'c', 'd']],
  ])('%s → %j', (code, expected) => {
    expect(declaredNames((firstStatement(code) as ExportNamedNode).declaration!)).toEqual(expected);
  });

  it('is undefined for a declaration without a runtime binding', () => {
    expect(declaredNames((firstStatement('export interface A {}') as ExportNamedNode).declaration!)).toBeUndefined();
  });
});

describe('walk', () => {
  it('visits nested nodes, parents first', () => {
    const types: string[] = [];
    walk(parseModule('f([a]);', 'module.js'), node => types.push(node.type));
    expect(types).toEqual([
      'Program',
      'ExpressionStatement',
      'CallExpression',
      'Identifier',
      'ArrayExpression',
      'Identifier',
    ]);
  });
});
