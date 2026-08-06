import { describe, expect, it, vi } from 'vitest';
import loader from '../../src/orchestrion/bundler/webpack-loader';

// Stand in for the upstream code-transform loader: a changed string signals a
// transformed module, the input unchanged signals a pass-through.
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/webpack-loader', () => ({
  default: function (this: { async: () => (e: unknown, c?: string, m?: unknown) => void }, code: string, map: unknown) {
    const callback = this.async();
    callback(null, code === 'PASS' ? code : `${code};//transformed`, map);
  },
}));

interface Ctx {
  resourcePath: string;
  _compilation?: unknown;
}

function runLoader(ctx: Ctx, code: string): string | undefined {
  let output: string | undefined;
  const context = {
    ...ctx,
    async: () => (_error: unknown, outCode?: string) => {
      output = outCode;
    },
  };
  (loader as (this: unknown, code: string) => void).call(context, code);
  return output;
}

const IOREDIS = '/app/node_modules/ioredis/built/Redis.js';

describe('orchestrion webpack/Turbopack loader', () => {
  it('appends the onInject call for a transformed module under Turbopack (no compilation)', () => {
    const output = runLoader({ resourcePath: IOREDIS }, 'code');

    expect(output).toContain('code;//transformed');
    expect(output).toContain('g.onInject("ioredis")');
  });

  it('records the module on `.bundler` even when the bridge is not installed yet', () => {
    const output = runLoader({ resourcePath: IOREDIS }, 'code') as string;
    const snippet = output.slice('code;//transformed'.length);

    // Bridge absent (early load): records `.bundler`, no throw.
    const early: { __SENTRY_ORCHESTRION__?: { bundler?: string[]; onInject?: (name: string) => void } } = {};
    // oxlint-disable-next-line typescript/no-implied-eval -- executing the generated injection snippet is the behavior under test
    new Function('globalThis', snippet)(early);
    expect(early.__SENTRY_ORCHESTRION__?.bundler).toEqual(['ioredis']);

    // Bridge present (loaded after init): records AND fires the bridge.
    const injected: string[] = [];
    const late = { __SENTRY_ORCHESTRION__: { onInject: (name: string) => injected.push(name) } };
    // oxlint-disable-next-line typescript/no-implied-eval -- executing the generated injection snippet is the behavior under test
    new Function('globalThis', snippet)(late);
    expect(injected).toEqual(['ioredis']);
  });

  it('does not append when webpack runs the plugin banner (compilation present)', () => {
    const output = runLoader({ resourcePath: IOREDIS, _compilation: {} }, 'code');

    expect(output).toBe('code;//transformed');
    expect(output).not.toContain('onInject');
  });

  it('does not append for a pass-through (untransformed) module', () => {
    const output = runLoader({ resourcePath: IOREDIS }, 'PASS');

    expect(output).toBe('PASS');
  });

  it.each([
    ['/app/node_modules/ioredis/built/Redis.js', 'ioredis'],
    ['/app/node_modules/@redis/client/dist/lib/client/index.js', '@redis/client'],
    // pnpm's nested layout: the real package is after the LAST node_modules.
    ['/app/node_modules/.pnpm/ioredis@5.10.1/node_modules/ioredis/built/Redis.js', 'ioredis'],
  ])('derives the package name from %s as %s', (resourcePath, expected) => {
    const output = runLoader({ resourcePath }, 'code');

    expect(output).toContain(`g.onInject("${expected}")`);
  });

  it('does not append when the path has no node_modules segment', () => {
    const output = runLoader({ resourcePath: '/app/src/index.js' }, 'code');

    expect(output).toBe('code;//transformed');
    expect(output).not.toContain('onInject');
  });
});
