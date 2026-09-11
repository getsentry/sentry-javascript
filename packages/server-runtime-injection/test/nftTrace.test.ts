import { join } from 'node:path';
import { nodeFileTrace } from '@vercel/nft';
import { describe, expect, it } from 'vitest';

/**
 * `Module.register()` resolves its specifier at runtime. nft does evaluate those calls, but it lost
 * the hook in the CJS build, where rollup reaches `node:module` through an interop namespace helper
 * it cannot follow, and that is the build Next.js loads. `output: 'standalone'`, Docker and Vercel
 * builds then leave the hook out and drop channel-based instrumentation, saying so only behind
 * `debug: true`.
 *
 * Runs the real `@vercel/nft` over the emitted entry points, because the guarantee is a property of
 * the built files, not of the source: it needs the package built.
 */
const repoRoot = join(__dirname, '..', '..', '..');
const buildDir = 'packages/server-runtime-injection/build';

async function traceFrom(entry: string): Promise<Set<string>> {
  const { fileList } = await nodeFileTrace([join(repoRoot, entry)], { base: repoRoot });
  return fileList;
}

describe.each(['cjs', 'esm'])('the %s build', variant => {
  it('traces the ESM loader hook and the chunks it imports', { timeout: 60_000 }, async () => {
    const traced = await traceFrom(`${buildDir}/${variant}/register.js`);

    expect(traced).toContain(`${buildDir}/esm/hook.js`);
    // The hook is ESM. Without this marker the loader thread parses it as CommonJS and fails.
    expect(traced).toContain(`${buildDir}/esm/package.json`);
    // The hook re-exports the vendored chain, so its presence alone would not prove the tracer
    // followed the hook's own imports rather than copying it as an opaque asset.
    expect(traced).toContain(`${buildDir}/esm/vendored/@apm-js-collab/tracing-hooks/hook.js`);
  });
});
