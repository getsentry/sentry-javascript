import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';
import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';

test.skip(!process.env.TEST_ENV?.startsWith('prod-'), '`withSentryConfig` adds the transform to Nitro CLI builds only');

function readServerBundle(): string {
  const serverDir = path.join(process.cwd(), '.output/server');
  return readdirSync(serverDir, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.mjs'))
    .map(file => readFileSync(path.join(serverDir, file), 'utf8'))
    .join('\n');
}

test('injects diagnostics-channel publishers into bundled dependencies', () => {
  const serverBundle = readServerBundle();

  expect(serverBundle).toContain('orchestrionModuleInjected');
  expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:generic-pool:acquire["']\)/);
});

// The runtime hook only sees modules that Node loads from `node_modules`, so a span from the bundled
// `generic-pool` shows that the build-time transform ran.
test('sends a span for a bundled instrumented dependency', async ({ request }) => {
  const spansPromise = collectStreamedSpans('nitro-3', spans =>
    spans.some(span => span.is_segment && span.name === 'GET /api/test-generic-pool'),
  );

  await request.get('/api/test-generic-pool');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment && span.name === 'GET /api/test-generic-pool');
  const acquireSpan = spans.find(span => span.name === 'generic-pool.acquire');

  expect(acquireSpan?.attributes[SENTRY_ORIGIN]?.value).toBe('auto.db.generic_pool');
  expect(acquireSpan?.trace_id).toBe(segmentSpan?.trace_id);
});
