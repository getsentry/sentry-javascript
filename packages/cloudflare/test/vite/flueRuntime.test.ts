import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sentryCloudflareVitePlugin } from '../../src/vite/index';

type TransformResult = { code: string } | null | undefined;
type TransformFn = (code: string, id: string, opts?: { ssr?: boolean }) => TransformResult | Promise<TransformResult>;
type TestPlugin = {
  name: string;
  configResolved?: (config: unknown) => void;
  buildStart?: (this: unknown) => void | Promise<void>;
  transform?: TransformFn | { handler: TransformFn };
};

const FLUE_ENTRY = 'import { r as instrument } from "./instrumentation.mjs";\nexport { instrument };\n';
const FLUE_IMPORT = /from\s*["']@flue\/runtime["']/;

/** Runs every module through `sentryCloudflareVitePlugin()`'s transforms, in order, as an SSR build would. */
async function createPipeline(root: string): Promise<(code: string, id: string) => Promise<string>> {
  const plugins = sentryCloudflareVitePlugin({ autoInstrumentation: false }) as TestPlugin[];

  for (const plugin of plugins) {
    plugin.configResolved?.({ root, command: 'build', plugins, ssr: {} });
    // Every package the app could import resolves, so a plugin that probes for `@flue/runtime` finds it.
    await plugin.buildStart?.call({ resolve: vi.fn(async (id: string) => ({ id })), warn: vi.fn() });
  }

  return async (source, id) => {
    let code = source;
    for (const { transform } of plugins) {
      const handler = typeof transform === 'function' ? transform : transform?.handler;
      const result = await handler?.call({}, code, id, { ssr: true });
      code = result?.code ?? code;
    }
    return code;
  };
}

describe('sentryCloudflareVitePlugin with @flue/runtime', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'cf-flue-runtime-'));
    const pkg = join(root, 'node_modules/@flue/runtime');
    mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ name: '@flue/runtime', version: '2.3.0', type: 'module' }),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("adds no @flue/runtime import to Sentry's Flue integration module", async () => {
    // Every instrumented package imports `@sentry/server-utils`. An `@flue/runtime` edge from there
    // closes a cycle through them, and Flue's module-level `createModels()` then runs before pi-ai's
    // `ModelsImpl` is initialized ("Cannot access 'ModelsImpl' before initialization").
    const transform = await createPipeline(root);
    const code = await transform(
      'export const flueIntegration = () => {};\n',
      join(root, 'node_modules/@sentry/server-utils/build/esm/integrations/flue.js'),
    );

    expect(code).not.toMatch(FLUE_IMPORT);
  });

  it('has the @flue/runtime entry publish its own namespace through a self-import', async () => {
    const transform = await createPipeline(root);
    const code = await transform(FLUE_ENTRY, join(root, 'node_modules/@flue/runtime/dist/index.mjs'));

    expect(code).toContain('import * as __SENTRY_SELF_PROVIDED__ from "./index.mjs";');
    expect(code).toContain('Object.defineProperty(globalThis.__SENTRY_ORCHESTRION__.providedModules, "@flue/runtime"');
    expect(code).not.toMatch(FLUE_IMPORT);
  });
});
