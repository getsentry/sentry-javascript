import { beforeAll, describe, expect, it } from 'vitest';
import { addImport, hasImport } from '../../src/rewriter/imports';
import { loadParser, parseModule } from '../../src/rewriter/parse';
import { createRewriteState } from '../../src/rewriter/rewriter';

beforeAll(async () => {
  await loadParser();
});

const IMPORT = "import { wrap } from 'sentry';";

function withImport(code: string): string {
  const ast = parseModule(code, 'module.ts');
  const state = createRewriteState(code);
  addImport(state, ast, IMPORT);
  addImport(state, ast, IMPORT);
  const output = state.ms.toString();
  expect(() => parseModule(output, 'module.ts')).not.toThrow();
  return output;
}

describe('addImport', () => {
  it('prepends the import once', () => {
    expect(withImport('const foo = 1;')).toBe(`${IMPORT}\nconst foo = 1;`);
  });

  it("inserts after a 'use server' directive", () => {
    expect(withImport("'use server';\nconst foo = 1;")).toBe(`'use server';\n${IMPORT}\nconst foo = 1;`);
  });

  it('inserts after a "use client" directive without a semicolon', () => {
    expect(withImport('"use client"\nconst foo = 1;')).toBe(`"use client"\n${IMPORT}\nconst foo = 1;`);
  });

  it('inserts after several directives', () => {
    expect(withImport("'use strict';\n'use server';\nconst foo = 1;")).toBe(
      `'use strict';\n'use server';\n${IMPORT}\nconst foo = 1;`,
    );
  });

  it('inserts after a hashbang', () => {
    expect(withImport('#!/usr/bin/env node\nconst foo = 1;')).toBe(`#!/usr/bin/env node\n${IMPORT}\nconst foo = 1;`);
  });
});

describe('hasImport', () => {
  it.each([
    ["import { wrap } from 'sentry';", true],
    ["import { other, wrap } from 'sentry';", true],
    ["import { wrap as alias } from 'sentry';", false],
    ["import { wrap } from 'elsewhere';", false],
    ["import type { wrap } from 'sentry';", false],
    ["import { type wrap } from 'sentry';", false],
    ["import * as wrap from 'sentry';", false],
  ])('%s → %s', (code, expected) => {
    expect(hasImport(parseModule(code, 'module.ts'), 'sentry', 'wrap')).toBe(expected);
  });
});
