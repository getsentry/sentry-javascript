import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertSourceMapUpload, getSourcemapSources } from '@sentry-internal/test-utils';

const OUTPUT = 'dist';

// Rolldown emits no map for chunks without mappable source: Flue's `app.mjs` only re-exports, and
// `rolldown-runtime-*.mjs` is the bundler's own helper code.
const debugIdsWithoutSourceMap = fs
  .readdirSync(OUTPUT)
  .filter(file => file === 'app.mjs' || /^rolldown-runtime-.+\.mjs$/.test(file))
  .flatMap(file => [...fs.readFileSync(path.join(OUTPUT, file), 'utf8').matchAll(/sentry-dbid-([\da-f-]{36})/gi)])
  .map(match => (match[1] as string).toLowerCase());

const { sourcemaps } = assertSourceMapUpload({
  outputDirs: [OUTPUT],
  markers: { 'agent source': 'SOURCEMAP_MARKER_SERVER' },
  debugIdsWithoutSourceMap,
});

const agentSources = sourcemaps
  .filter(map => map.sourcemap.sourcesContent?.some(source => source?.includes('SOURCEMAP_MARKER_SERVER')))
  .flatMap(map => getSourcemapSources(map.sourcemap));
assert.ok(
  agentSources.some(source => source.endsWith('src/agents/hello.ts')),
  `Expected the uploaded source map to resolve to src/agents/hello.ts, got: ${agentSources.join(', ')}`,
);

console.log('All source map assertions passed!');
