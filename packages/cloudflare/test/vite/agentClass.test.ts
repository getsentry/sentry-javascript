import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { collectAgentCandidates, detectAgentClasses, type ModuleResolver } from '../../src/vite/agentClass';

function parseJS(code: string) {
  return parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as { body: any[] };
}

const ENTRY = '/app/src/index.js';

/**
 * A resolver over an in-memory module graph. Relative specifiers resolve against `/app/src`, bare
 * ones into `/app/node_modules`, mirroring how Vite reports third-party ids.
 */
function createResolver(modules: Record<string, string>): ModuleResolver & { loaded: string[] } {
  const loaded: string[] = [];
  return {
    loaded,
    parse: (code: string) => parseJS(code),
    async resolve(source: string, _importer: string) {
      if (source.startsWith('.')) {
        const id = `/app/src/${source.replace(/^\.\//, '')}.js`;
        return { id };
      }
      return { id: `/app/node_modules/${source}/dist/index.js` };
    },
    readFile(id: string) {
      loaded.push(id);
      return modules[id];
    },
  };
}

async function detect(entryCode: string, modules: Record<string, string> = {}, resolver?: ModuleResolver) {
  const ast = parseJS(entryCode);
  const candidates = collectAgentCandidates(ast, extractClassNames(entryCode));
  return detectAgentClasses(ast, ENTRY, candidates, resolver ?? createResolver(modules));
}

/** Every class name mentioned in the entry, so tests don't have to restate the wrangler config. */
function extractClassNames(code: string): string[] {
  return [...code.matchAll(/class\s+(\w+)/g)].map(match => match[1]!);
}

describe('detectAgentClasses', () => {
  it('detects a class extending `Agent` from `agents`', async () => {
    const code = ["import { Agent } from 'agents';", 'export class MyAgent extends Agent {}'].join('\n');
    expect(await detect(code)).toEqual(new Set(['MyAgent']));
  });

  it('does not detect a plain Durable Object', async () => {
    const code = ["import { DurableObject } from 'cloudflare:workers';", 'export class MyDO extends DurableObject {}'];
    expect(await detect(code.join('\n'))).toEqual(new Set());
  });

  it('detects `AIChatAgent` from `@cloudflare/ai-chat`', async () => {
    const code = [
      "import { AIChatAgent } from '@cloudflare/ai-chat';",
      'export class Chat extends AIChatAgent {}',
    ].join('\n');
    expect(await detect(code)).toEqual(new Set(['Chat']));
  });

  it('detects `McpAgent` from `agents/mcp`', async () => {
    const code = ["import { McpAgent } from 'agents/mcp';", 'export class MyMCP extends McpAgent {}'].join('\n');
    expect(await detect(code)).toEqual(new Set(['MyMCP']));
  });

  it('detects `Think` from `@cloudflare/think`', async () => {
    const code = ["import { Think } from '@cloudflare/think';", 'export class Thinker extends Think {}'].join('\n');
    expect(await detect(code)).toEqual(new Set(['Thinker']));
  });

  it('resolves a chain of subclasses declared in the entry', async () => {
    const code = [
      "import { Agent } from 'agents';",
      'class Base extends Agent {}',
      'class Middle extends Base {}',
      'export class Leaf extends Middle {}',
    ].join('\n');
    expect(await detect(code)).toContain('Leaf');
  });

  it('resolves a base class imported from another module', async () => {
    const code = ["import { MyBase } from './base';", 'export class MyAgent extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/base.js': ["import { Agent } from 'agents';", 'export class MyBase extends Agent {}'].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('resolves a base class several modules deep', async () => {
    const code = ["import { Level1 } from './l1';", 'export class MyAgent extends Level1 {}'].join('\n');
    const modules = {
      '/app/src/l1.js': ["import { Level2 } from './l2';", 'export class Level1 extends Level2 {}'].join('\n'),
      '/app/src/l2.js': ["import { Agent } from 'agents';", 'export class Level2 extends Agent {}'].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('resolves a base class through a barrel re-export', async () => {
    const code = ["import { MyBase } from './barrel';", 'export class MyAgent extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/barrel.js': "export { MyBase } from './base';",
      '/app/src/base.js': ["import { Agent } from 'agents';", 'export class MyBase extends Agent {}'].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('resolves a base class through a star re-export', async () => {
    const code = ["import { MyBase } from './barrel';", 'export class MyAgent extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/barrel.js': "export * from './base';",
      '/app/src/base.js': ["import { Agent } from 'agents';", 'export class MyBase extends Agent {}'].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('resolves a renamed re-export', async () => {
    const code = ["import { Renamed } from './barrel';", 'export class MyAgent extends Renamed {}'].join('\n');
    const modules = {
      '/app/src/barrel.js': "export { MyBase as Renamed } from './base';",
      '/app/src/base.js': ["import { Agent } from 'agents';", 'export class MyBase extends Agent {}'].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('resolves a default-exported base class', async () => {
    const code = ["import MyBase from './base';", 'export class MyAgent extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/base.js': ["import { Agent } from 'agents';", 'export default class MyBase extends Agent {}'].join(
        '\n',
      ),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('resolves a namespace-imported Agent base', async () => {
    const code = ["import * as agents from 'agents';", 'export class MyAgent extends agents.Agent {}'].join('\n');
    expect(await detect(code)).toEqual(new Set(['MyAgent']));
  });

  it('does not detect a non-Agent base class from another module', async () => {
    const code = ["import { MyBase } from './base';", 'export class MyDO extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/base.js': [
        "import { DurableObject } from 'cloudflare:workers';",
        'export class MyBase extends DurableObject {}',
      ].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set());
  });

  it('does not walk into node_modules for unknown packages', async () => {
    const code = ["import { Base } from 'some-pkg';", 'export class MyDO extends Base {}'].join('\n');
    const resolver = createResolver({
      '/app/node_modules/some-pkg/dist/index.js': [
        "import { Agent } from 'agents';",
        'export class Base extends Agent {}',
      ].join('\n'),
    });

    expect(await detect(code, {}, resolver)).toEqual(new Set());
    expect(resolver.loaded).not.toContain('/app/node_modules/some-pkg/dist/index.js');
  });

  it('survives a circular module graph', async () => {
    const code = ["import { A } from './a';", 'export class MyAgent extends A {}'].join('\n');
    const modules = {
      '/app/src/a.js': ["import { B } from './b';", 'export class A extends B {}'].join('\n'),
      '/app/src/b.js': ["import { A } from './a';", 'export class B extends A {}'].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set());
  });

  it('tolerates an unresolvable module', async () => {
    const code = ["import { Missing } from './missing';", 'export class MyDO extends Missing {}'].join('\n');
    expect(await detect(code, {})).toEqual(new Set());
  });

  it('tolerates an unparseable module', async () => {
    const code = ["import { Broken } from './broken';", 'export class MyDO extends Broken {}'].join('\n');
    expect(await detect(code, { '/app/src/broken.js': 'this is ) not ( javascript' })).toEqual(new Set());
  });

  // Sibling modules are read raw off disk, so they are usually still TypeScript. A JS parser would
  // choke on all of this; the source scan only needs the declaration-level syntax.
  it('resolves a base class through unstripped TypeScript', async () => {
    const code = ["import { MyBase } from './base';", 'export class MyAgent extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/base.js': [
        "import { Agent } from 'agents';",
        "import type { Something } from './types';",
        '',
        'interface Props { name: string }',
        '',
        'export abstract class MyBase<Env = unknown> extends Agent<Env, Props> {',
        '  private readonly field: Map<string, number> = new Map();',
        '  protected async method(arg: string): Promise<void> {}',
        '}',
      ].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  // A constrained generic (`<T extends S>`) puts an `extends` before the superclass clause; the
  // source scan must skip the parameter list rather than latch onto the constraint.
  it('resolves a base class past a constrained generic parameter', async () => {
    const code = ["import { MyBase } from './base';", 'export class MyAgent extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/base.js': [
        "import { Agent } from 'agents';",
        'interface Constraint { name: string }',
        'export class MyBase<T extends Constraint> extends Agent<Env> {',
        '  private field?: T;',
        '}',
      ].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('resolves a base class past a nested generic constraint', async () => {
    const code = ["import { MyBase } from './base';", 'export class MyAgent extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/base.js': [
        "import { Agent } from 'agents';",
        'export class MyBase<T extends Map<string, number>> extends Agent<Env> {}',
      ].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set(['MyAgent']));
  });

  it('ignores an `extends` that only appears inside a comment or string', async () => {
    const code = ["import { MyBase } from './base';", 'export class MyDO extends MyBase {}'].join('\n');
    const modules = {
      '/app/src/base.js': [
        "import { DurableObject } from 'cloudflare:workers';",
        "import { Agent } from 'agents';",
        '// export class MyBase extends Agent {}',
        '/* class MyBase extends Agent {} */',
        'export class MyBase extends DurableObject {',
        '  hint = "class Other extends Agent {}";',
        '}',
      ].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set());
  });

  it('ignores a type-only import of an Agent base', async () => {
    const code = ["import { MyBase } from './base';", 'export class MyDO extends MyBase {}'].join('\n');
    const modules = {
      // `Agent` is imported for types only, so `MyBase` genuinely extends the DO base at runtime.
      '/app/src/base.js': [
        "import type { Agent } from 'agents';",
        "import { DurableObject } from 'cloudflare:workers';",
        'export class MyBase extends DurableObject {}',
      ].join('\n'),
    };
    expect(await detect(code, modules)).toEqual(new Set());
  });

  it('works without resolve/readFile (entry-local chains only)', async () => {
    const resolver: ModuleResolver = { parse: (c: string) => parseJS(c) };
    const local = ["import { Agent } from 'agents';", 'export class MyAgent extends Agent {}'].join('\n');
    expect(await detect(local, {}, resolver)).toEqual(new Set(['MyAgent']));

    const crossModule = ["import { MyBase } from './base';", 'export class MyAgent extends MyBase {}'].join('\n');
    expect(await detect(crossModule, {}, resolver)).toEqual(new Set());
  });
});

describe('collectAgentCandidates', () => {
  it('only returns configured names that are classes in this module', async () => {
    const code = ['class MyAgent {}', 'class Unrelated {}'].join('\n');
    expect(collectAgentCandidates(parseJS(code), ['MyAgent', 'Elsewhere'])).toEqual(new Set(['MyAgent']));
  });

  it('maps a configured name back to its aliased local class', async () => {
    const code = ['class LocalAgent {}', 'export { LocalAgent as ConfiguredAgent };'].join('\n');
    expect(collectAgentCandidates(parseJS(code), ['ConfiguredAgent'])).toEqual(new Set(['LocalAgent']));
  });

  it('returns a configured name re-exported from another module', async () => {
    const code = "export { MyAgent } from './agent';";
    expect(collectAgentCandidates(parseJS(code), ['MyAgent'])).toEqual(new Set(['MyAgent']));
  });

  it('returns the local binding of a configured name imported from another module', async () => {
    const code = ["import { Impl as MyAgent } from './agent';", 'export { MyAgent };'].join('\n');
    expect(collectAgentCandidates(parseJS(code), ['MyAgent'])).toEqual(new Set(['MyAgent']));
  });

  it('returns nothing when no binding points at the configured name', async () => {
    const code = "export * from './agent';";
    expect(collectAgentCandidates(parseJS(code), ['MyAgent'])).toEqual(new Set());
  });
});
