import { describe, expect, it, vi } from 'vitest';

// Mock the third-party transform so the test covers OUR loader logic (appending the prologue, module
// name derivation, passthrough) rather than the real code transform. Returns non-null for everything
// except paths containing `skip`, so we can exercise both branches.
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/core', () => ({
  createCodeTransformer: () => ({
    transform: (code: string, id: string) =>
      id.includes('skip') ? null : { code: `/*instrumented*/${code}`, map: undefined },
    getCodeToInject: () => undefined,
  }),
}));

import { buildInjectBootSnippet, buildInjectPrologue } from '../../src/orchestrion/bundler/inject';

describe('buildInjectPrologue', () => {
  it('records the module in `.bundler` and calls the on-inject bridge, guarded by try/catch', () => {
    const prologue = buildInjectPrologue('ioredis');

    expect(prologue).toContain('globalThis.__SENTRY_ORCHESTRION__');
    expect(prologue).toContain('g.bundler.push("ioredis")');
    expect(prologue).toContain('globalThis.__SENTRY_ORCHESTRION_ON_INJECT__');
    expect(prologue).toContain('cb("ioredis")');
    expect(prologue).toContain('try{');
    // Single line so it never shifts source-map mappings.
    expect(prologue).not.toContain('\n');
  });
});

describe('buildInjectBootSnippet', () => {
  it('records the modules in `.bundler` and announces each via the on-inject bridge', () => {
    const injected: string[] = [];
    const globalObj: {
      __SENTRY_ORCHESTRION__?: { bundler?: string[] };
      __SENTRY_ORCHESTRION_ON_INJECT__?: (name: string) => void;
    } = { __SENTRY_ORCHESTRION_ON_INJECT__: name => injected.push(name) };

    const snippet = buildInjectBootSnippet(['mysql', 'ioredis']);
    // The snippet references `globalThis`, so evaluate it with a `globalThis` bound to our stub.
    // oxlint-disable-next-line typescript/no-implied-eval
    new Function('globalThis', snippet)(globalObj);

    expect(globalObj.__SENTRY_ORCHESTRION__?.bundler).toEqual(['mysql', 'ioredis']);
    expect(injected).toEqual(['mysql', 'ioredis']);
  });

  it('sets `.bundler` even when the bridge is not installed yet, without throwing', () => {
    const globalObj: { __SENTRY_ORCHESTRION__?: { bundler?: string[] } } = {};

    const snippet = buildInjectBootSnippet(['mysql']);
    // oxlint-disable-next-line typescript/no-implied-eval
    expect(() => new Function('globalThis', snippet)(globalObj)).not.toThrow();

    expect(globalObj.__SENTRY_ORCHESTRION__?.bundler).toEqual(['mysql']);
  });

  it('is a single line so it never shifts source-map mappings', () => {
    expect(buildInjectBootSnippet(['mysql'])).not.toContain('\n');
  });
});
