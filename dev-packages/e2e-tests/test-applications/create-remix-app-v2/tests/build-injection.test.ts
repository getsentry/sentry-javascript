import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// The `db.test.ts` runtime assertions prove orchestrion spans appear, but spans alone
// don't prove they came from the BUILD-time transform: if the Vite plugin silently
// failed to load, the deps would stay external and the runtime `--require` hook would
// inject the channels at runtime instead - the span tests would still pass. These
// assertions inspect the built server bundle directly so a broken plugin can't hide
// behind that runtime fallback. Only relevant in the orchestrion variant.
test.describe('orchestrion build-time injection', () => {
  test.skip(process.env.INJECT_ORCHESTRION !== 'true', 'Only runs in the orchestrion variant');

  const serverBundle = readFileSync(path.join(process.cwd(), 'build/server/index.js'), 'utf8');

  test('force-bundles the instrumented deps instead of externalizing them', () => {
    // The plugin adds mysql/ioredis to `ssr.noExternal` so the transform sees their
    // source. Without it they'd be left as bare imports or `require(...)` calls resolved
    // from node_modules at runtime - untouched, with no channels injected.
    expect(serverBundle).not.toMatch(/(from\s*["']mysql["']|require\(["']mysql["']\))/);
    expect(serverBundle).not.toMatch(/(from\s*["']ioredis["']|require\(["']ioredis["']\))/);
  });

  test('injects the diagnostics-channel publishers into the bundled deps', () => {
    // The transform wraps each instrumented function with a `tracingChannel("<name>")`
    // publisher whose channel name is a string literal. The subscriber side passes the
    // channel name as a variable, so a literal-arg match is unique to the injected
    // publisher and proves the build-time transform ran.
    expect(serverBundle).toMatch(/tracingChannel(\$?\d)?\(["']orchestrion:mysql:query["']\)/);
    expect(serverBundle).toMatch(/tracingChannel(\$?\d)?\(["']orchestrion:ioredis:command["']\)/);
    expect(serverBundle).toMatch(/tracingChannel(\$?\d)?\(["']orchestrion:ioredis:connect["']\)/);
  });

  test('injects the diagnostics-channel publishers into @remix-run/server-runtime', () => {
    // Remix's own instrumentation is orchestrion-based too: the transform force-bundles
    // and injects channels into `@remix-run/server-runtime` (the subscriber is
    // `remixChannelIntegration`).
    expect(serverBundle).toMatch(
      /tracingChannel(\$?\d)?\(["']orchestrion:@remix-run\/server-runtime:requestHandler["']\)/,
    );
    expect(serverBundle).toMatch(
      /tracingChannel(\$?\d)?\(["']orchestrion:@remix-run\/server-runtime:callRouteLoader["']\)/,
    );
  });
});
