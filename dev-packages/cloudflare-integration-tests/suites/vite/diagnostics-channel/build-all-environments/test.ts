import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { SENTRY_OP, SENTRY_ORIGIN, URL_PATH } from '@sentry/conventions/attributes';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

// Regression test: a top-level `ssr` option from the orchestrion plugin made Vite create an extra
// `ssr` environment without an entry. A `buildApp` that builds every environment then failed with
// "input should not be an html file when building for SSR".
it('builds when buildApp builds every Vite environment', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const spanItem = envelope[1].find(item => item[0].type === 'span');
      const container = spanItem?.[1] as SerializedStreamedSpanContainer;
      const serverSpan = container.items.find(item => item.is_segment);

      expect(serverSpan?.attributes[SENTRY_OP]?.value).toBe('http.server');
      expect(serverSpan?.attributes[SENTRY_ORIGIN]?.value).toBe('auto.http.cloudflare');
      expect(serverSpan?.attributes[URL_PATH]?.value).toBe('/worker');
    })
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/worker');
  expect(response).toBe('streamText: function');
  await runner.completed();

  expect(readdirSync(join(__dirname, 'dist')).sort()).toEqual(['client', 'cloudflare_vite_dc_build_all_environments']);

  const workerDir = join(__dirname, 'dist', 'cloudflare_vite_dc_build_all_environments');
  const workerBundle = readdirSync(workerDir)
    .filter(name => /\.m?js$/.test(name))
    .map(name => readFileSync(join(workerDir, name), 'utf8'))
    .join('\n');
  expect(workerBundle).toContain('orchestrion:ai:streamText');
});
