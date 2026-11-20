import { beforeAll, describe, expect, it } from 'vitest';
import { findClassesExtending } from '../../src/rewriter/class-extends';
import { loadParser, parseModule } from '../../src/rewriter/parse';

beforeAll(async () => {
  await loadParser();
});

const BASE = { module: 'cloudflare:workers', name: 'WorkerEntrypoint' };

function find(code: string): Set<string> {
  return findClassesExtending(parseModule(code, 'module.js'), BASE);
}

describe('findClassesExtending', () => {
  it('finds a class extending the named import', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'export class A extends WorkerEntrypoint {}',
    ];
    expect(find(code.join('\n'))).toEqual(new Set(['A']));
  });

  it('follows an aliased import', () => {
    const code = ["import { WorkerEntrypoint as WE } from 'cloudflare:workers';", 'class A extends WE {}'];
    expect(find(code.join('\n'))).toEqual(new Set(['A']));
  });

  it('finds a class extending a namespace member', () => {
    const code = [
      "import * as cf from 'cloudflare:workers';",
      'class A extends cf.WorkerEntrypoint {}',
      'class B extends cf.Other {}',
    ];
    expect(find(code.join('\n'))).toEqual(new Set(['A']));
  });

  it('resolves an indirect chain declared out of order', () => {
    const code = [
      "import { WorkerEntrypoint } from 'cloudflare:workers';",
      'class C extends B {}',
      'class B extends A {}',
      'class A extends WorkerEntrypoint {}',
    ];
    expect(find(code.join('\n'))).toEqual(new Set(['A', 'B', 'C']));
  });

  it('ignores the same name imported from another module', () => {
    const code = ["import { WorkerEntrypoint } from 'elsewhere';", 'class A extends WorkerEntrypoint {}'];
    expect(find(code.join('\n'))).toEqual(new Set());
  });

  it('ignores classes without the base import', () => {
    expect(find('class A extends B {}')).toEqual(new Set());
  });
});
