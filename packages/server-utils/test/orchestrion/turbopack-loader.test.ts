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

import { buildInjectPrologue } from '../../src/orchestrion/bundler/inject';
import loader from '../../src/orchestrion/bundler/turbopack-loader';

function runLoader(resourcePath: string, code: string): string | undefined {
  let out: string | undefined;
  const ctx = {
    resourcePath,
    async: () => (_error: Error | null, transformed?: string) => {
      out = transformed;
    },
  };
  (loader as (this: unknown, code: string, map?: unknown) => void).call(ctx, code, null);
  return out;
}

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

describe('sentry orchestrion turbopack loader', () => {
  it('appends the self-registration prologue to instrumented modules', () => {
    const out = runLoader('/app/node_modules/ioredis/built/Redis.js', 'ORIGINAL');

    expect(out).toContain('/*instrumented*/ORIGINAL');
    expect(out).toContain(buildInjectPrologue('ioredis'));
  });

  it('passes non-instrumented modules through untouched', () => {
    const out = runLoader('/app/node_modules/skip-me/index.js', 'ORIGINAL');

    expect(out).toBe('ORIGINAL');
  });

  it('derives scoped package names for the prologue', () => {
    const out = runLoader('/app/node_modules/@scope/pkg/index.js', 'ORIGINAL');

    expect(out).toContain(buildInjectPrologue('@scope/pkg'));
  });

  it('uses the innermost node_modules segment for nested dependencies', () => {
    const out = runLoader('/app/node_modules/a/node_modules/ioredis/built/Redis.js', 'ORIGINAL');

    expect(out).toContain(buildInjectPrologue('ioredis'));
  });
});
